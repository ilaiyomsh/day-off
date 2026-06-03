/**
 * DayOffView — the app shell. Ported from the prototype's App() in app.jsx:
 * header (brand + Settings), role-based tabs, the active <main> view, the modal
 * switchboard wired to useDayOffData() mutations, and the toast stack.
 *
 * Dropped from the prototype (per the port spec): the persona switcher, the
 * Tweaks panel/useTweaks, and the theme/layout toggles — theme follows the
 * platform and the "mine" layout is fixed to calendar+list.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../core';
import { useDayOffData } from '../contexts/DayOffDataProvider';
import { Avatar, Icon } from './ui';
import { EmployeeView } from './views/EmployeeView';
import { TeamView } from './views/TeamView';
import { ApprovalsView } from './views/ApprovalsView';
import { DashboardView, type DrillPayload } from './views/DashboardView';
import { CompanyDaysView } from './views/CompanyDaysView';
import { RequestModal } from './modals/RequestModal';
import { RequestDetailModal } from './modals/RequestDetailModal';
import { ApproveModal } from './modals/ApproveModal';
import { RejectModal } from './modals/RejectModal';
import { CompanyDayModal } from './modals/CompanyDayModal';
import { DrillModal } from './modals/DrillModal';
import { SettingsDialog } from './Settings/SettingsDialog';
import type { CompanyDay, DayOffRequest, RequestDraft } from '../domain/types';

interface TabDef {
  id: string;
  labelKey: string;
  icon: string;
}

const TABS: { employee: TabDef[]; manager: TabDef[] } = {
  employee: [
    { id: 'mine', labelKey: 'tabs.mine', icon: 'user' },
    { id: 'team', labelKey: 'tabs.team', icon: 'users' },
  ],
  manager: [
    { id: 'dashboard', labelKey: 'tabs.dashboard', icon: 'chart' },
    { id: 'approvals', labelKey: 'tabs.approvals', icon: 'inbox' },
    { id: 'mine', labelKey: 'tabs.mine', icon: 'user' },
    { id: 'team', labelKey: 'tabs.team', icon: 'users' },
    { id: 'company', labelKey: 'tabs.company', icon: 'calendar' },
  ],
};

type ModalState =
  | { kind: 'request'; initial?: (Partial<RequestDraft> & { id?: string }) | null }
  | { kind: 'detail'; request: DayOffRequest; asManager: boolean }
  | { kind: 'reject'; request: DayOffRequest }
  | { kind: 'approve'; request: DayOffRequest }
  | { kind: 'companyDay'; initial?: CompanyDay | null }
  | { kind: 'drill'; payload: DrillPayload }
  | null;

export function DayOffView() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const {
    currentUser,
    isManager,
    toasts,
    requests,
    year,
    onYearChange,
    submitRequest,
    approve,
    reject,
    approveAll,
    cancelRequest,
    saveCompanyDay,
    deleteCompanyDay,
  } = useDayOffData();

  const [activeTab, setActiveTab] = useState('mine');
  const [modal, setModal] = useState<ModalState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const notConfigured = !settings.requestsBoardId;

  const pendingCount = requests.filter(
    (r) => r.status === 'pending' && r.employeeId !== currentUser.id,
  ).length;

  const tabs = isManager ? TABS.manager : TABS.employee;

  // ---- mutation wiring: do the write via the data hook, then close the modal ----
  function onSubmitRequest(draft: RequestDraft) {
    const editingId = modal?.kind === 'request' ? modal.initial?.id : undefined;
    void submitRequest(draft, editingId);
    setModal(null);
  }
  function onApprove(r: DayOffRequest, note?: string) {
    void approve(r, note);
    setModal(null);
  }
  function onReject(r: DayOffRequest, reason?: string) {
    void reject(r, reason);
    setModal(null);
  }
  function onApproveAll() {
    void approveAll();
  }
  function onCancelRequest(r: DayOffRequest) {
    void cancelRequest(r);
    setModal(null);
  }
  function onSaveCompanyDay(draft: Parameters<typeof saveCompanyDay>[0]) {
    void saveCompanyDay(draft);
    setModal(null);
  }
  function onDeleteCompanyDay(h: CompanyDay) {
    void deleteCompanyDay(h);
    setModal(null);
  }

  if (notConfigured) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-brand">
            <span className="brand-mark">
              <Icon name="calendar" size={20} />
            </span>
            <div>
              <h1>{t('app.title')}</h1>
              <div className="brand-sub">{t('app.brandSub')}</div>
            </div>
          </div>
          <button className="persona-btn" onClick={() => setSettingsOpen(true)}>
            <Icon name="info" size={16} />
            {t('settings.open')}
          </button>
        </header>
        <main className="app-main">
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('app.notConfigured')}</p>
        </main>
        <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      {/* header */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-mark">
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <h1>{t('app.title')}</h1>
            <div className="brand-sub">{t('app.brandSub')}</div>
          </div>
        </div>

        <div className="persona">
          <button className="persona-btn" onClick={() => setSettingsOpen(true)}>
            <Avatar emp={currentUser} />
            <div className="persona-meta">
              <span className="persona-name">{currentUser.name}</span>
              <span className="persona-role">
                {isManager ? t('app.managerView') : t('app.employeeView')}
              </span>
            </div>
            <Icon name="info" size={16} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>
      </header>

      {/* tabs */}
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={17} />
            {t(tab.labelKey)}
            {tab.id === 'approvals' && pendingCount > 0 && (
              <span className="tab-count">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* content */}
      <main className="app-main">
        {activeTab === 'mine' && (
          <EmployeeView
            onNewRequest={() => setModal({ kind: 'request' })}
            onAddOnDay={(k) => setModal({ kind: 'request', initial: { start: k, end: k } })}
            onOpenRequest={(r) => setModal({ kind: 'detail', request: r, asManager: false })}
          />
        )}
        {activeTab === 'team' && (
          <TeamView
            onOpenRequest={(r) => setModal({ kind: 'detail', request: r, asManager: isManager })}
          />
        )}
        {activeTab === 'approvals' && (
          <ApprovalsView
            currentUserId={currentUser.id}
            onOpenRequest={(r) => setModal({ kind: 'detail', request: r, asManager: true })}
            onApprove={(r) => onApprove(r)}
            onReject={(r) => setModal({ kind: 'reject', request: r })}
            onApproveAll={onApproveAll}
          />
        )}
        {activeTab === 'dashboard' && (
          <DashboardView
            year={year}
            onYearChange={onYearChange}
            onOpenDrill={(payload) => setModal({ kind: 'drill', payload })}
          />
        )}
        {activeTab === 'company' && (
          <CompanyDaysView
            year={year}
            onYearChange={onYearChange}
            onAdd={() => setModal({ kind: 'companyDay' })}
            onEdit={(h) => setModal({ kind: 'companyDay', initial: h })}
          />
        )}
      </main>

      {/* modals */}
      {modal?.kind === 'request' && (
        <RequestModal
          currentUser={currentUser}
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSubmit={onSubmitRequest}
        />
      )}
      {modal?.kind === 'detail' && (
        <RequestDetailModal
          request={modal.request}
          viewerIsManager={modal.asManager}
          onClose={() => setModal(null)}
          onApprove={(r) => setModal({ kind: 'approve', request: r })}
          onReject={(r) => setModal({ kind: 'reject', request: r })}
          onCancel={onCancelRequest}
          onEdit={(r) => setModal({ kind: 'request', initial: r })}
        />
      )}
      {modal?.kind === 'reject' && (
        <RejectModal
          request={modal.request}
          onClose={() => setModal({ kind: 'detail', request: modal.request, asManager: true })}
          onConfirm={(r, reason) => onReject(r, reason)}
        />
      )}
      {modal?.kind === 'approve' && (
        <ApproveModal
          request={modal.request}
          onClose={() => setModal({ kind: 'detail', request: modal.request, asManager: true })}
          onConfirm={(r, note) => onApprove(r, note)}
        />
      )}
      {modal?.kind === 'companyDay' && (
        <CompanyDayModal
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSave={onSaveCompanyDay}
          onDelete={onDeleteCompanyDay}
        />
      )}
      {modal?.kind === 'drill' && (
        <DrillModal
          title={modal.payload.title}
          sub={modal.payload.sub}
          requests={modal.payload.requests}
          onOpenRequest={(r) => setModal({ kind: 'detail', request: r, asManager: true })}
          onClose={() => setModal(null)}
        />
      )}

      {/* toasts */}
      <div className="toast-wrap">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.variant}`}>
            {toast.variant === 'success' && <Icon name="check" size={16} />}
            {toast.variant === 'danger' && <Icon name="ban" size={16} />}
            {toast.text}
          </div>
        ))}
      </div>

      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
