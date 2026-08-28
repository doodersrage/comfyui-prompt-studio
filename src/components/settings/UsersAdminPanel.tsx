'use client';

import { useUsersAdminState } from '@/hooks/useUsersAdminState';
import UsersAdminGroupsPanel from '@/components/settings/panels/UsersAdminGroupsPanel';
import UsersAdminQuotaPanel from '@/components/settings/panels/UsersAdminQuotaPanel';
import UsersAdminAnalyticsPanel from '@/components/settings/panels/UsersAdminAnalyticsPanel';
import UsersAdminSharedPresetsPanel from '@/components/settings/panels/UsersAdminSharedPresetsPanel';
import UsersAdminSharedProjectsPanel from '@/components/settings/panels/UsersAdminSharedProjectsPanel';
import UsersAdminAuditLogPanel from '@/components/settings/panels/UsersAdminAuditLogPanel';
import UsersAdminUserListPanel from '@/components/settings/panels/UsersAdminUserListPanel';
import UsersAdminUserFormPanel from '@/components/settings/panels/UsersAdminUserFormPanel';

export default function UsersAdminPanel() {
  const admin = useUsersAdminState();

  return (
    <div className="space-y-8">
      {admin.status ? (
        <p className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--accent-text)]">
          {admin.status}
        </p>
      ) : null}

      <UsersAdminGroupsPanel
        groups={admin.groups}
        selectedGroupId={admin.selectedGroupId}
        setSelectedGroupId={admin.setSelectedGroupId}
        selectedGroup={admin.selectedGroup}
        groupForm={admin.groupForm}
        setGroupForm={admin.setGroupForm}
        onSaveGroup={admin.saveGroup}
        onDeleteGroup={admin.deleteGroup}
      />

      <UsersAdminQuotaPanel users={admin.users} groups={admin.groups} />

      <UsersAdminAnalyticsPanel
        analyticsSnapshots={admin.analyticsSnapshots}
        analyticsHistory={admin.analyticsHistory}
        selectedUserId={admin.selectedUserId}
        selectedUserAnalytics={admin.selectedUserAnalytics}
      />

      <UsersAdminSharedPresetsPanel
        sharedPresets={admin.sharedPresets}
        sharedPresetDraft={admin.sharedPresetDraft}
        setSharedPresetDraft={admin.setSharedPresetDraft}
        onPublishPreset={admin.publishPreset}
        onDeletePreset={admin.deletePreset}
      />

      <UsersAdminSharedProjectsPanel
        groups={admin.groups}
        sharedProjects={admin.sharedProjects}
        sharedProjectDraft={admin.sharedProjectDraft}
        setSharedProjectDraft={admin.setSharedProjectDraft}
        onPublishProject={admin.publishProject}
        onDeleteProject={admin.deleteProject}
      />

      <UsersAdminAuditLogPanel auditEntries={admin.auditEntries} />

      <UsersAdminUserListPanel
        users={admin.users}
        selectedUserId={admin.selectedUserId}
        setSelectedUserId={admin.setSelectedUserId}
      />

      <UsersAdminUserFormPanel
        selectedUserId={admin.selectedUserId}
        selectedUser={admin.selectedUser}
        groups={admin.groups}
        userForm={admin.userForm}
        setUserForm={admin.setUserForm}
        onSaveUser={admin.saveUser}
        onInviteUser={admin.inviteUser}
        onDeleteUser={admin.deleteUser}
      />
    </div>
  );
}
