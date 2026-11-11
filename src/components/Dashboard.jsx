import React, { useCallback, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../config.js';
import { buildProjectAlerts } from '../utils/projectAlerts.js';
import '../styles/Dashboard.css';
import '../styles/Chatbotanimations.css';
import { RevealText, TypingDots } from './ChatParts';
import { 
  FiGrid, 
  FiFolder, 
  FiMessageSquare,
  FiBell, 
  FiShield, 
  FiClock, 
  FiCheckSquare, 
  FiChevronsLeft,
  FiChevronsRight,
  FiLogOut,
  FiSend,
  FiTrash2
} from 'react-icons/fi';

const DEFAULT_CHAT = [
  {
    id: 1,
    sender: 'bot',
    text: 'Halo! Saya Vantage AI Assistant. Saya siap membantu memberikan informasi seluruh proyek yang ada di website ini. Mau cek proyek apa?',
    time: '15.30'
  }
];

const OPEN_INTENT = /\b(buka|open|masuk ke|pergi ke|go to)\b/i;
const normalizeProjectName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const revealDuration = (text) => Math.min(900, Math.max(350, text.length * 10));

const Dashboard = ({ 
  onLogout, 
  activeTab = 'overview', 
  onNavigate, 
  onSelectProject,
  sidebarCollapsed,
  onToggleSidebar,
  userName,
  userAvatar,
  onUpdateProfile 
}) => {
  // State Modal Profile Edit
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(userName);
  const [editAvatar, setEditAvatar] = useState(userAvatar);

  useEffect(() => {
    setEditName(userName);
    setEditAvatar(userAvatar);
  }, [userName, userAvatar]);

  const handleAvatarFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatar(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile(editName, editAvatar);
    }
    setIsProfileModalOpen(false);
  };

  // State Data dari Backend
  const [commercialProjects, setCommercialProjects] = useState([]);
  const [nonCommercialProjects, setNonCommercialProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // State filter priority & tanggal
  const [commFilter, setCommFilter] = useState('all');
  const [nonCommFilter, setNonCommFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // State Notifikasi
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // State Metrics
  const [statsCount, setStatsCount] = useState({
    ongoing: 0,
    delayed: 0,
    dueSoon: 0,
    completed: 0
  });

  // State Chatbot Assistant + LocalStorage Persistence
  const [chatMessages, setChatMessages] = useState(() => {
    const savedChat = localStorage.getItem('vantage_chat_history');
    if (savedChat) {
      try {
        return JSON.parse(savedChat);
      } catch (err) {
        console.error('Gagal membaca riwayat chat:', err);
      }
    }
    return DEFAULT_CHAT;
  });

  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sendAnimating, setSendAnimating] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [newMessageIds, setNewMessageIds] = useState(() => new Set());
  const chatEndRef = useRef(null);
  const sendTimer = useRef(null);
  const navigationTimers = useRef(new Set());

  const projectByName = new Map(
    allProjects.map((project) => [normalizeProjectName(project.projectName), project])
  );
  const scheduleNavigation = (project) => {
    const timerId = setTimeout(() => {
      navigationTimers.current.delete(timerId);
      if (onSelectProject) onSelectProject(project);
    }, 1100);
    navigationTimers.current.add(timerId);
  };

  useEffect(() => () => {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    navigationTimers.current.forEach((timerId) => clearTimeout(timerId));
  }, []);

  useEffect(() => {
    localStorage.setItem('vantage_chat_history', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    if (activeTab === 'assistant' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isTyping, activeTab]);

  const handleClearChat = () => {
    if (window.confirm('Yakin mau menghapus seluruh riwayat chat?')) {
      setChatMessages(DEFAULT_CHAT);
      localStorage.removeItem('vantage_chat_history');
    }
  };

  // Fungsi Kirim Pesan via API Gemini Backend
  const handleSendChatMessage = async (text = chatInput) => {
    if (!text.trim() || isTyping) return;

    const userQuery = text.trim();
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
    const userMessageId = Date.now();

    const userMsg = {
      id: userMessageId,
      sender: 'user',
      text: userQuery,
      time: currentTime
    };

    setNewMessageIds((previous) => new Set(previous).add(userMessageId));
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);
    if (sendTimer.current) clearTimeout(sendTimer.current);
    setSendAnimating(true);
    sendTimer.current = setTimeout(() => setSendAnimating(false), 600);

    const normalizedQuery = normalizeProjectName(userQuery);
    const mentionedProjects = allProjects
      .filter((project) => {
        const name = normalizeProjectName(project.projectName);
        return name.length >= 3 && normalizedQuery.includes(name);
      })
      .sort((a, b) => normalizeProjectName(b.projectName).length - normalizeProjectName(a.projectName).length)
      .filter((project, index, matches) => {
        const name = normalizeProjectName(project.projectName);
        return !matches.some((other, otherIndex) =>
          otherIndex < index && normalizeProjectName(other.projectName).includes(name)
        );
      })
      .slice(0, 4);
    const shouldAutoOpen = OPEN_INTENT.test(userQuery) && mentionedProjects.length === 1;

    try {
      const token = localStorage.getItem('vantage_token');
      
      const response = await axios.post(
        `${API_URL}/api/chat`,
        { message: userQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const botReplyText = response.data?.reply || 'Tidak ada respon dari AI.';
      const botMessageId = userMessageId + 1;

      const botMsg = {
        id: botMessageId,
        sender: 'bot',
        text: botReplyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.'),
        ...(mentionedProjects.length > 0 && {
          projectNames: mentionedProjects.map((project) => String(project.projectName).trim())
        })
      };

      setNewMessageIds((previous) => new Set(previous).add(botMessageId));
      setChatMessages((prev) => [...prev, botMsg]);
      if (shouldAutoOpen) scheduleNavigation(mentionedProjects[0]);
    } catch (error) {
      console.error('Error memanggil API Chat:', error);
      
      const errorMsg = {
        id: userMessageId + 1,
        sender: 'bot',
        text: 'Maaf, gagal terhubung ke server AI. Pastikan server backend kamu (node server.js) sudah menyala.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
      };
      
      setNewMessageIds((previous) => new Set(previous).add(errorMsg.id));
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const scrollWhileRevealing = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) return 'GOOD MORNING';
    if (hour >= 12 && hour < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      const token = localStorage.getItem('vantage_token');
      
      if (!token) {
        if (onLogout) onLogout();
        return;
      }

      try {
        let url = `${API_URL}/api/projects`;
        if (startDate && endDate) {
          url += `?startDate=${startDate}&endDate=${endDate}`;
        }
        
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data?.success) {
          const rawData = response.data.data || [];
          
          const formattedData = rawData.map((row, index) => {
            const computed = row.computedStatus || row['Status'] || 'On Going';
            const computedLower = String(computed).toLowerCase();
            const condition = String(row.condition || row['Condition'] || 'On Track').trim();
            const taskName = row['Task / Step'] || row['Task'] || row['task'] || 'Task';
            const planEnd = row['Plan End'] || row['plannedEnd'] || row['Plan End'] || '-';
            const daysRem = row.daysRemaining !== undefined ? Number(row.daysRemaining) : null;
            
            let statusType = 'ongoing-yellow'; 
            let displayStatus = computed;
            let dueText = null;

            if (computedLower === 'delayed') {
              statusType = 'delayed';
              displayStatus = 'On Going'; 
              dueText = (daysRem !== null && daysRem < 0) ? `Delayed for ${Math.abs(daysRem)} days` : 'Delayed';
            } else if (computedLower === 'completed') {
              statusType = 'completed';
            } else if (computedLower === 'due soon' || computedLower === 'on going') {
              if (daysRem !== null && daysRem >= 0 && daysRem <= 10) {
                dueText = `${daysRem} Days Remaining`;
                if (computedLower === 'due soon') statusType = 'ongoing-orange';
              }
            }

            const commColValue = String(
              row['Commercial / Non Commercial?'] || 
              row['Commercial / Non Commercial'] || 
              row['Category'] || 
              row['Type'] || ''
            ).toLowerCase().trim();

            const isNonComm = commColValue.includes('non');

            return {
              id: index,
              projectName: row['Project Name'] || row['Title'] || row['Nama Project'] || 'Disney + Project',
              title: row['Project Name'] || row['Title'] || row['Nama Project'] || 'Disney + Project',
              priority: row['Priority'] || row['priority'] || '1',
              plannedEnd: planEnd,
              actualEnd: row['Actual End'] || '-', 
              status: displayStatus,
              statusType: statusType,
              due: dueText,
              type: isNonComm ? 'non-commercial' : 'commercial',
              pm: row['PM'] || row['PIC'] || 'AL GANTENG',
              computedStatus: computed,
              condition: condition,
              daysRemaining: daysRem,
              task: taskName,
              planEnd: planEnd,
              rawData: row
            };
          });

          const uniqueProjects = new Map();
          formattedData.forEach((project) => {
            const projectKey = normalizeProjectName(project.projectName);
            if (projectKey && !uniqueProjects.has(projectKey)) {
              uniqueProjects.set(projectKey, project);
            }
          });
          setAllProjects(Array.from(uniqueProjects.values()));

          if (response.data.metrics) {
            setStatsCount({
              ongoing: response.data.metrics.onGoing || 0,
              delayed: response.data.metrics.delayed || 0,
              dueSoon: response.data.metrics.dueSoon || 0,
              completed: response.data.metrics.completed || 0
            });
          }

          const highlightOnly = formattedData.filter(item => {
            const highlightValue = item.rawData['Highlight Project'] || '';
            return highlightValue.toString().toLowerCase() === 'yes';
          });

          setCommercialProjects(highlightOnly.filter(item => item.type === 'commercial'));
          setNonCommercialProjects(highlightOnly.filter(item => item.type === 'non-commercial'));

          generateNotificationsFromData(formattedData);
        }
      } catch (err) {
        console.error('Gagal memuat data dari Backend:', err);
        if (err.response?.status === 401 && onLogout) {
          onLogout();
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [startDate, endDate, onLogout]);

  const generateNotificationsFromData = (dataList) => {
    if (!dataList || dataList.length === 0) {
      setNotifications([{ title: '✅ All Clear', desc: 'Tidak ada project yang terlambat atau mendekati deadline.' }]);
      return;
    }

    const notifItems = buildProjectAlerts(dataList).slice(0, 4);

    if (notifItems.length === 0) {
      setNotifications([{ title: '✅ All Clear', desc: 'Tidak ada project yang terlambat atau mendekati deadline.' }]);
      return;
    }

    setNotifications(notifItems);
  };

  const getUniquePriorities = (projectList) => {
    const defaultPriorities = ['1', '2', '3'];
    const dataPriorities = (projectList || []).map(p => p.priority).filter(Boolean);
    return Array.from(new Set([...defaultPriorities, ...dataPriorities])).sort();
  };

  const filteredCommercial = commercialProjects.filter(item => {
    return commFilter === 'all' ? true : item.priority === commFilter;
  });

  const filteredNonCommercial = nonCommercialProjects.filter(item => {
    return nonCommFilter === 'all' ? true : item.priority === nonCommFilter;
  });

  return (
    <div className={`dashboard-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-top-row">
            <div className="sidebar-logo-circle">
              <span className="sidebar-logo-text">VANTAGE</span>
            </div>
            <button 
              className="sidebar-collapse-btn-small" 
              onClick={onToggleSidebar}
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
            onClick={() => onNavigate && onNavigate('projects', 'All Statuses')}
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

      {/* MAIN CONTENT AREA */}
      {activeTab === 'assistant' ? (
        /* CHATBOT ASSISTANT VIEW */
        <main className="chatbot-page-container">
          <header className="chatbot-top-header">
            <div style={{ width: '0px' }}></div>

            <div className="chatbot-title-pill">
              <h1>VANTAGE ASSISTANT</h1>
            </div>

            <div className="chatbot-header-right">
              <div 
                className="user-avatar" 
                onClick={() => setIsProfileModalOpen(true)}
                style={{ cursor: 'pointer' }}
                title="Klik untuk Edit Profil"
              >
                <img src={userAvatar} alt="User Profile" />
              </div>
            </div>
          </header>

          <div className="chatbot-card">
            <div className="chatbot-card-header">
              <div>
                <h3>Vantage Assistant</h3>
                <span className="chatbot-status-online">● Online</span>
              </div>
              <button 
                className="chatbot-clear-btn" 
                onClick={handleClearChat}
                title="Hapus Riwayat Chat"
              >
                <FiTrash2 size={18} />
              </button>
            </div>

            <div className="chatbot-message-body">
              {chatMessages.map((msg) => {
                const isNew = newMessageIds.has(msg.id);
                const isBot = msg.sender === 'bot';
                const projects = (msg.projectNames || [])
                  .map((name) => projectByName.get(normalizeProjectName(name)))
                  .filter(Boolean);

                return (
                  <div key={msg.id} className={`chat-message-row ${msg.sender}`}>
                    <div className={`chat-bubble ${msg.sender}${isNew ? ' vantage-anim' : ''}`}>
                      <p>
                        {isBot ? (
                          <RevealText text={msg.text} animate={isNew} onProgress={scrollWhileRevealing} />
                        ) : (
                          msg.text
                        )}
                      </p>

                      {isBot && onSelectProject && projects.length > 0 && (
                        <div
                          className="vantage-actions"
                          style={isNew ? { animationDelay: `${revealDuration(msg.text) + 100}ms` } : undefined}
                        >
                          {projects.map((project) => (
                            <button
                              key={normalizeProjectName(project.projectName)}
                              type="button"
                              className="vantage-open-btn"
                              onClick={() => onSelectProject(project)}
                            >
                              Buka detail: {project.projectName}
                            </button>
                          ))}
                        </div>
                      )}

                      <span className="chat-time">{msg.time}</span>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="chat-message-row bot">
                  <div className="chat-bubble bot vantage-anim">
                    <TypingDots />
                  </div>
                </div>
              )}

              {chatMessages.length === 1 && !isTyping && (
                <div className="vantage-chips">
                  {[
                    'Daftar proyek',
                    'Proyek yang delayed',
                    ...(allProjects[0]
                      ? [`Tampilkan ${allProjects[0].projectName}`]
                      : [])
                  ].map((suggestion, index) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="vantage-chip"
                      style={{ animationDelay: `${index * 80}ms` }}
                      onClick={() => handleSendChatMessage(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="chatbot-input-area">
              <div className="chatbot-input-pill">
                <input 
                  type="text" 
                  placeholder="Tanyakan Pada kami"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                />
                <button
                  className={`chatbot-send-btn${sendAnimating ? ' is-sending' : ''}`}
                  onClick={() => handleSendChatMessage()}
                >
                  <FiSend size={18} />
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* OVERVIEW DASHBOARD VIEW */
        <main className="main-content">
          <header className="dashboard-header">
            <div className="header-left">
              <div className="welcome-text">
                <h1>
                  <span className="text-dark-blue">{getGreeting()} </span>
                  <span className="text-light-blue">{userName}</span>
                </h1>
                <p>Semoga harimu senin terus....</p>
              </div>
            </div>

            <div className="header-right">
              <div className="header-user-row">
                <div className="notification-bell-wrapper">
                  <div 
                    className="notification-bell" 
                    onClick={() => setShowNotifications(!showNotifications)}
                    title="Notifications"
                  >
                    <FiBell className="bell-icon" />
                    <span className="bell-badge">{notifications.length || 0}</span>
                  </div>

                  {showNotifications && (
                    <div className="notification-dropdown">
                      <div className="notification-list">
                        {notifications.map((item, idx) => (
                          <div className="notification-card" key={idx}>
                            <h4 className="notification-title">{item.title}</h4>
                            <p className="notification-desc">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div 
                  className="user-avatar" 
                  onClick={() => setIsProfileModalOpen(true)}
                  style={{ cursor: 'pointer' }}
                  title="Klik untuk Edit Profil"
                >
                  <img src={userAvatar} alt="User Profile" />
                </div>
              </div>
              
              <div className="date-filter-pill">
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                  className="date-input"
                />
                <span className="date-separator">-</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                  className="date-input"
                />
              </div>
            </div>
          </header>

          <section className="stats-grid">
            <div className="stat-card ongoing">
              <div className="stat-card-header">
                <span className="stat-title">On Going Project</span>
                <FiShield className="stat-icon" />
              </div>
              <div className="stat-card-body">
                <span className="stat-value">{loading ? '...' : statsCount.ongoing}</span>
                <button 
                  className="view-all-btn" 
                  onClick={() => onNavigate && onNavigate('projects', 'On Going')}
                >
                  View All
                </button>
              </div>
            </div>

            <div className="stat-card delayed">
              <div className="stat-card-header">
                <span className="stat-title">Delayed Project</span>
                <FiClock className="stat-icon" />
              </div>
              <div className="stat-card-body">
                <span className="stat-value">{loading ? '...' : statsCount.delayed}</span>
                <button 
                  className="view-all-btn" 
                  onClick={() => onNavigate && onNavigate('projects', 'Delayed')}
                >
                  View All
                </button>
              </div>
            </div>

            <div className="stat-card due-soon">
              <div className="stat-card-header">
                <span className="stat-title">Due Soon (10 days)</span>
                <FiClock className="stat-icon" />
              </div>
              <div className="stat-card-body">
                <span className="stat-value">{loading ? '...' : statsCount.dueSoon}</span>
                <button 
                  className="view-all-btn" 
                  onClick={() => onNavigate && onNavigate('projects', 'Due Soon')}
                >
                  View All
                </button>
              </div>
            </div>

            <div className="stat-card completed">
              <div className="stat-card-header">
                <span className="stat-title">Project Completed</span>
                <FiCheckSquare className="stat-icon" />
              </div>
              <div className="stat-card-body">
                <span className="stat-value">{loading ? '...' : statsCount.completed}</span>
                <button 
                  className="view-all-btn" 
                  onClick={() => onNavigate && onNavigate('projects', 'Completed')}
                >
                  View All
                </button>
              </div>
            </div>
          </section>

          <section className="project-health-grid">
            <div className="health-column">
              <div className="column-header">
                <span>Commercial Project Health (Highlight)</span>
                <select 
                  className="filter-select"
                  value={commFilter}
                  onChange={(e) => setCommFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {getUniquePriorities(commercialProjects).map((prio, idx) => (
                    <option key={idx} value={prio}>
                      {prio}
                    </option>
                  ))}
                </select>
              </div>

              <div className="project-list">
                {filteredCommercial.map((item, idx) => (
                  <div 
                    className="project-item-card" 
                    key={idx}
                    onClick={() => onSelectProject && onSelectProject(item)}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk melihat Detail Project"
                  >
                    <div className="project-info-left">
                      <h3 className="project-name">{item.title}</h3>
                      <div className="project-status-row">
                        <span className={`status-dot ${item.statusType}`}></span>
                        <span className="status-label">Status: {item.status}</span>
                        {item.due && <span className="due-label">{item.due}</span>}
                      </div>
                    </div>

                    <div className="project-info-right">
                      <span className="priority-tag">{item.priority}</span>
                      <div className="date-info">
                        <span>Planned End: {item.plannedEnd}</span>
                        <span>Actual End: {item.actualEnd}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCommercial.length === 0 && !loading && (
                   <p style={{textAlign: 'center', marginTop: '20px', color: '#666'}}>Tidak ada project Highlight komersial.</p>
                )}
              </div>
            </div>

            <div className="health-column">
              <div className="column-header">
                <span>Non Commercial Project Health (Highlight)</span>
                <select 
                  className="filter-select"
                  value={nonCommFilter}
                  onChange={(e) => setNonCommFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {getUniquePriorities(nonCommercialProjects).map((prio, idx) => (
                    <option key={idx} value={prio}>
                      {prio}
                    </option>
                  ))}
                </select>
              </div>

              <div className="project-list">
                {filteredNonCommercial.map((item, idx) => (
                  <div 
                    className="project-item-card" 
                    key={`non-${idx}`}
                    onClick={() => onSelectProject && onSelectProject(item)}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk melihat Detail Project"
                  >
                    <div className="project-info-left">
                      <h3 className="project-name">{item.title}</h3>
                      <div className="project-status-row">
                        <span className={`status-dot ${item.statusType}`}></span>
                        <span className="status-label">Status: {item.status}</span>
                        {item.due && <span className="due-label">{item.due}</span>}
                      </div>
                    </div>

                    <div className="project-info-right">
                      <span className="priority-tag">{item.priority}</span>
                      <div className="date-info">
                        <span>Planned End: {item.plannedEnd}</span>
                        <span>Actual End: {item.actualEnd}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredNonCommercial.length === 0 && !loading && (
                   <p style={{textAlign: 'center', marginTop: '20px', color: '#666'}}>Tidak ada project Highlight non-komersial.</p>
                )}
              </div>
            </div>
          </section>
        </main>
      )}

      {/* MODAL EDIT PROFIL */}
      {isProfileModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            padding: '24px',
            borderRadius: '16px',
            width: '320px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#002C4A', fontWeight: '800', textAlign: 'center' }}>
              Edit Profil User
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <img 
                src={editAvatar} 
                alt="Preview" 
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #496D89' }} 
              />
              <label style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#ffffff',
                backgroundColor: '#496D89',
                padding: '6px 14px',
                borderRadius: '12px',
                cursor: 'pointer'
              }}>
                Unggah Foto Baru
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarFileChange} 
                  style={{ display: 'none' }} 
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#4b5563' }}>Username</label>
              <input 
                type="text" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button 
                type="button" 
                onClick={() => setIsProfileModalOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button 
                type="button" 
                onClick={handleSaveProfile}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#002C4A',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;