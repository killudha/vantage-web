export const normalizeProjectName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const getTaskColumn = (task = {}) => {
  const computedStatus = String(
    task.computedStatus || task['computedStatus'] || task['Status'] || task.status || task.rawStatus || ''
  ).trim();
  const condition = String(task.condition || task['condition'] || task['Condition'] || '').trim();
  const rawStatus = String(task.rawStatus || task['rawStatus'] || computedStatus || '').trim().toLowerCase();

  if (computedStatus && computedStatus.toLowerCase() === 'completed') return 'done';
  if (condition && condition.toLowerCase() === 'delayed') return 'delayed';

  if (computedStatus) {
    const normalizedComputedStatus = computedStatus.toLowerCase();
    if (normalizedComputedStatus === 'on going') return 'onProgress';
    if (normalizedComputedStatus === 'planning') return 'planning';
  }

  if (rawStatus.includes('complet') || rawStatus.includes('done')) return 'done';
  if (rawStatus.includes('delay')) return 'delayed';
  if (rawStatus.includes('going') || rawStatus.includes('progress') || rawStatus.includes('due soon')) return 'onProgress';

  return 'planning';
};

const parseDaysRemaining = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildProjectAlerts = (rows = []) => {
  const groupedProjects = new Map();

  rows.forEach((row) => {
    const projectName = String(
      row.projectName || row['Project Name'] || row.title || row['Title'] || row['Nama Project'] || ''
    ).trim();

    if (!projectName) return;

    const computedStatus = String(row.computedStatus || row['Status'] || row.status || '').trim();
    const condition = String(row.condition || row['Condition'] || '').trim();

    if (computedStatus.toLowerCase() === 'completed') return;

    const normalizedCondition = condition.toLowerCase();
    if (normalizedCondition !== 'delayed' && normalizedCondition !== 'due soon') return;

    const taskName = String(
      row.task || row['Task / Step'] || row['Task'] || row['task'] || 'Task'
    ).trim() || 'Task';
    const planEnd = String(
      row.planEnd || row['Plan End'] || row['plannedEnd'] || row['planEnd'] || ''
    ).trim();
    const daysRemaining = parseDaysRemaining(
      row.daysRemaining ?? row['daysRemaining'] ?? row['Days Remaining'] ?? row['DaysRemaining']
    );

    const projectKey = normalizeProjectName(projectName);
    if (!groupedProjects.has(projectKey)) {
      groupedProjects.set(projectKey, {
        projectName,
        tasks: []
      });
    }

    groupedProjects.get(projectKey).tasks.push({
      task: taskName,
      planEnd,
      daysRemaining,
      kind: normalizedCondition === 'delayed' ? 'delayed' : 'dueSoon'
    });
  });

  const alertItems = Array.from(groupedProjects.values()).map(({ projectName, tasks }) => {
    const sortedTasks = [...tasks].sort((a, b) => {
      const kindOrder = (a.kind === 'delayed' ? 0 : 1) - (b.kind === 'delayed' ? 0 : 1);
      if (kindOrder !== 0) return kindOrder;
      const leftDays = a.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      const rightDays = b.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      return leftDays - rightDays;
    });

    const primaryTask = sortedTasks[0];
    if (!primaryTask) return null;

    const otherTasks = sortedTasks.length - 1;
    const dayCount = Math.abs(primaryTask.daysRemaining ?? 0);
    const textPrefix = primaryTask.kind === 'delayed' ? '🚨 Delayed' : '⏳ Due Soon';

    const description = primaryTask.kind === 'delayed'
      ? `Task "${primaryTask.task}" terlambat ${dayCount} hari (Plan End ${primaryTask.planEnd}).`
      : `Task "${primaryTask.task}" berakhir dalam ${dayCount === 0 ? 'hari ini' : `${dayCount} hari`} (Plan End ${primaryTask.planEnd}).`;

    return {
      kind: primaryTask.kind,
      daysRemaining: primaryTask.daysRemaining ?? Number.MAX_SAFE_INTEGER,
      title: `${textPrefix}: ${projectName}`,
      desc: `${description}${otherTasks > 0 ? ` +${otherTasks} task lain perlu perhatian.` : ''}`
    };
  }).filter(Boolean);

  alertItems.sort((a, b) => {
    const kindOrder = (a.kind === 'delayed' ? 0 : 1) - (b.kind === 'delayed' ? 0 : 1);
    if (kindOrder !== 0) return kindOrder;
    return a.daysRemaining - b.daysRemaining;
  });

  return alertItems.map(({ title, desc }) => ({ title, desc }));
};
