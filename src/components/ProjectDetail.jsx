import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config.js';
import { getTaskColumn } from '../utils/projectAlerts.js';
import '../styles/Dashboard.css';
import '../styles/ProjectDetail.css';
import { 
  FiGrid,
  FiFolder,
  FiMessageSquare,
  FiArrowLeft,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronDown,
  FiLogOut
} from 'react-icons/fi';

const ProjectDetail = ({ onLogout, activeTab = 'detail', onNavigate, onBack, project }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [tasks, setTasks] = useState({
    planning: [],
    onProgress: [],
    delayed: [],
    done: []
  });

  const [popupTask, setPopupTask] = useState(null);

  const projectName = project?.projectName || project?.title || project?.rawData?.['Project Name'] || 'Project';
  const projectPM = project?.pm || project?.rawData?.['PM'] || project?.rawData?.['Project Manager'] || 'AL GANTENG';

  useEffect(() => {
    const fetchProjectDetails = async () => {
      if (!project) return;
      setLoading(true);
      
      const token = localStorage.getItem('vantage_token');
      if (!token) {
        if(onLogout) onLogout();
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/api/projects`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          const allData = response.data.data || [];
          
          const projectTasks = allData.filter(item => {
            const itemProjName = String(item['Project Name'] || item['Title'] || item['Nama Project'] || '').trim().toLowerCase();
            const currentProjName = String(projectName).trim().toLowerCase();
            return itemProjName === currentProjName;
          });

          const mappedTasks = projectTasks.map((row, index) => {
            let phaseVal = row['Phase'] || row['phase'] || 'Back End';
            let taskVal = row['Task / Step'] || row['Task'] || row['task'] || 'UAT';
            let remarkVal = row['Remark'] || row['remark'] || row['Findings'] || 'Tidak ada catatan.';
            let complexityVal = row['Complexity'] || row['complexity'] || 'High';
            let segmentVal = row['Segment'] || row['segment'] || row['Segmen'] || '-'; 
            let planStartVal = row['Plan Start'] || row['plannedStart'] || '-';
            let planEndVal = row['Plan End'] || row['plannedEnd'] || '-';

            Object.keys(row).forEach(key => {
              const cleanKey = key.toLowerCase().trim();
              
              if (cleanKey.includes('phase')) phaseVal = row[key];
              if (cleanKey.includes('task') || cleanKey.includes('step')) taskVal = row[key];
              if (cleanKey.includes('remark') || cleanKey.includes('finding')) remarkVal = row[key];
              if (cleanKey.includes('complex')) complexityVal = row[key];
              if (cleanKey.includes('segmen')) segmentVal = row[key];
              if (cleanKey === 'plan start' || cleanKey === 'plannedstart') planStartVal = row[key];
              if (cleanKey === 'plan end' || cleanKey === 'plannedend') planEndVal = row[key];
            });

            return {
              id: index,
              category: String(phaseVal || 'Back End'),
              title: String(taskVal || 'UAT'),
              desc: String(remarkVal || 'Tidak ada catatan.'),
              priority: String(complexityVal || 'High'),
              segment: String(segmentVal || '-'),
              planStart: String(planStartVal || '-'),
              planEnd: String(planEndVal || '-'),
              computedStatus: String(row.computedStatus || row['Status'] || '').trim(),
              condition: String(row.condition || row['Condition'] || '').trim(),
              rawStatus: String(row.computedStatus || row['Status'] || '').toLowerCase(),
              task: String(taskVal || 'UAT')
            };
          });

          const grouped = {
            planning: [],
            onProgress: [],
            delayed: [],
            done: []
          };

          mappedTasks.forEach(task => {
            const column = getTaskColumn(task);
            grouped[column].push(task);
          });

          setTasks(grouped);
        }
      } catch (err) {
        console.error('Gagal memuat detail project:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjectDetails();
  }, [project, projectName, onLogout]);

  const handleOpenPopup = (task) => {
    setPopupTask(task);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else if (onNavigate) onNavigate('projects');
  };

  return (
    <div className={`dashboard-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-top-row">
            <div className="sidebar-logo-circle">
              <span className="sidebar-logo-text">VANTAGE</span>
            </div>
            <button 
              className="sidebar-collapse-btn-small" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label="Toggle Sidebar"
            >
              {sidebarCollapsed ? <FiChevronsRight size={14} /> : <FiChevronsLeft size={14} />}
            </button>
          </div>
          <hr className="sidebar-divider" />
        </div>

        <nav className="sidebar-menu">
          <button 
            className={`menu-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onNavigate && onNavigate('overview')}
          >
            <FiGrid className="menu-icon" />
            <span className="menu-text">Overview</span>
          </button>
          <button 
            className={`menu-item ${activeTab === 'projects' || activeTab === 'detail' ? 'active' : ''}`}
            onClick={() => onNavigate && onNavigate('projects')}
          >
            <FiFolder className="menu-icon" />
            <span className="menu-text">Projects List</span>
          </button>
          <button 
            className={`menu-item ${activeTab === 'assistant' ? 'active' : ''}`}
            onClick={() => onNavigate && onNavigate('assistant')}
          >
            <FiMessageSquare className="menu-icon" />
            <span className="menu-text">AI Assistant</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="logout-btn" onClick={onLogout} title="Logout">
            <FiLogOut className="logout-icon" />
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </aside>

      <main className="detail-page-container">
        <header className="detail-top-header">
          <button 
            type="button"
            className="detail-back-btn"
            onClick={handleBack}
            title="Kembali"
            aria-label="Kembali ke halaman sebelumnya"
          >
            <FiArrowLeft size={20} />
          </button>

          <div className="detail-title-pill">
            <h1>DETAIL PROJECTS</h1>
          </div>

          <div className="detail-header-right">
            <div className="user-avatar">
              <img src="https://via.placeholder.com/40" alt="User Profile" />
            </div>
          </div>
        </header>

        <div 
          className="project-name-banner" 
          onClick={() => onNavigate && onNavigate('projects')}
          title="Klik untuk kembali ke daftar proyek"
          style={{ cursor: 'pointer' }}
        >
          <h2>{projectName}</h2>
        </div>

        <div className="pm-info-row">
          <span className="pm-label">PM</span>
          <span className="pm-name">{projectPM}</span>
        </div>

        <section className="kanban-board-grid">
          {loading ? (
             <p style={{marginLeft: '20px'}}>Memuat data detail project...</p>
          ) : (
            <>
              <div className="kanban-column">
                <div className="column-header-pill">
                  <span className="status-tag yellow">Planning</span>
                  <span className="count-text">({tasks.planning.length})</span>
                  <FiChevronDown className="dropdown-chevron" />
                </div>
                <div className="task-list">
                  {tasks.planning.map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onOpenPopup={() => handleOpenPopup(task)} 
                    />
                  ))}
                </div>
              </div>

              <div className="kanban-column">
                <div className="column-header-pill">
                  <span className="status-tag green">On Progress</span>
                  <span className="count-text">({tasks.onProgress.length})</span>
                  <FiChevronDown className="dropdown-chevron" />
                </div>
                <div className="task-list">
                  {tasks.onProgress.map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onOpenPopup={() => handleOpenPopup(task)} 
                    />
                  ))}
                </div>
              </div>

              <div className="kanban-column">
                <div className="column-header-pill">
                  <span className="status-tag red">Delayed</span>
                  <span className="count-text">({tasks.delayed.length})</span>
                  <FiChevronDown className="dropdown-chevron" />
                </div>
                <div className="task-list">
                  {tasks.delayed.map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onOpenPopup={() => handleOpenPopup(task)} 
                    />
                  ))}
                </div>
              </div>

              <div className="kanban-column">
                <div className="column-header-pill">
                  <span className="status-tag blue">Done</span>
                  <span className="count-text">({tasks.done.length})</span>
                  <FiChevronDown className="dropdown-chevron" />
                </div>
                <div className="task-list">
                  {tasks.done.map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onOpenPopup={() => handleOpenPopup(task)} 
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {popupTask && (
          <div className="specs-modal-overlay" onClick={() => setPopupTask(null)}>
            <div className="specs-modal-content" onClick={e => e.stopPropagation()}>
              <div className="specs-modal-header">
                <h3>{popupTask.title}</h3>
                <button className="specs-modal-close-btn" onClick={() => setPopupTask(null)}>&times;</button>
              </div>
              <div className="specs-modal-body">
                <strong>Task / Step:</strong> {popupTask.title}
                <br /><br />
                <strong>Remarks:</strong> {popupTask.desc}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

const getShortTitle = (title) => {
  if (!title) return '';
  const words = title.trim().split(/\s+/);
  if (words.length <= 3) return title;
  return words.slice(0, 3).join(' ') + '...';
};

const TaskCard = ({ task, onOpenPopup }) => {
  const shortTitle = getShortTitle(task.title);

  return (
    <div className="kanban-task-card">
      <div className="task-card-top">
        <span className="task-category">{task.category}</span>
        <span className="task-priority">{task.priority}</span>
      </div>

      <div className="task-card-body">
        <div className="red-accent-line"></div>
        <div className="task-main-content">
          <h4 className="task-title" title={task.title}>{shortTitle}</h4>
          
          <div className="task-desc-wrapper">
            <p className="task-desc">
              Remarks: {task.desc}
            </p>
          </div>

          <button className="view-specs-btn" onClick={onOpenPopup}>
            View Specs
          </button>
        </div>
      </div>

      <div className="task-card-footer">
        <div className="meta-item">
          <span className="meta-label">Segment</span>
          <span className="meta-val">{task.segment}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Plan Start</span>
          <span className="meta-val">{task.planStart}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Plan End</span>
          <span className="meta-val">{task.planEnd}</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;