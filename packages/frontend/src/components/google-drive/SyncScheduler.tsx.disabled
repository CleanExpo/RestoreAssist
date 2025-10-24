import React, { useState, useEffect, useCallback } from 'react';
import { useBackupSchedule } from '../../hooks/useGoogleDrive';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Edit,
  CheckCircle,
  AlertCircle,
  Loader,
  X,
  Settings,
  TrendingUp,
  BarChart3,
  AlertTriangle
} from 'lucide-react';

interface SyncSchedulerProps {
  organizationId: string;
  onScheduleChange?: (scheduleId: string, enabled: boolean) => void;
  onManualTrigger?: (scheduleId: string) => void;
  showStatistics?: boolean;
}

type Frequency = 'daily' | 'weekly' | 'monthly';

interface ScheduleFormData {
  frequency: Frequency;
  enabled: boolean;
  time: string; // HH:MM format
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
}

export const SyncScheduler: React.FC<SyncSchedulerProps> = ({
  organizationId,
  onScheduleChange,
  onManualTrigger,
  showStatistics = true
}) => {
  const {
    schedule,
    loading,
    error,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    triggerNow,
    refetch
  } = useBackupSchedule(organizationId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [formData, setFormData] = useState<ScheduleFormData>({
    frequency: 'daily',
    enabled: true,
    time: '02:00',
    dayOfWeek: 0,
    dayOfMonth: 1
  });

  // Format next run date
  const formatNextRun = (date: Date | string | null): string => {
    if (!date) return 'Not scheduled';
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 1) {
      return `in ${diffDays} days`;
    } else if (diffHours > 1) {
      return `in ${diffHours} hours`;
    } else if (diffMs > 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `in ${diffMinutes} minutes`;
    } else {
      return 'Overdue';
    }
  };

  // Format full date
  const formatFullDate = (date: Date | string | null): string => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get frequency label
  const getFrequencyLabel = (freq: Frequency): string => {
    switch (freq) {
      case 'daily':
        return 'Every day';
      case 'weekly':
        return 'Every week';
      case 'monthly':
        return 'Every month';
      default:
        return freq;
    }
  };

  // Get day of week name
  const getDayName = (day: number): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  };

  // Handle create schedule
  const handleCreateSchedule = async () => {
    try {
      await createSchedule(formData.frequency);
      setShowCreateForm(false);
      setFormData({ frequency: 'daily', enabled: true, time: '02:00', dayOfWeek: 0, dayOfMonth: 1 });
      await refetch();
    } catch (err) {
      console.error('Failed to create schedule:', err);
    }
  };

  // Handle update schedule
  const handleUpdateSchedule = async () => {
    if (!schedule?.id) return;

    try {
      await updateSchedule(schedule.id, {
        frequency: formData.frequency,
        enabled: formData.enabled
      });
      setShowEditForm(false);
      await refetch();
    } catch (err) {
      console.error('Failed to update schedule:', err);
    }
  };

  // Handle toggle schedule
  const handleToggleSchedule = async (enabled: boolean) => {
    if (!schedule?.id) return;

    try {
      await updateSchedule(schedule.id, { enabled });
      onScheduleChange?.(schedule.id, enabled);
      await refetch();
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  // Handle delete schedule
  const handleDeleteSchedule = async () => {
    if (!schedule?.id) return;

    try {
      await deleteSchedule(schedule.id);
      setShowDeleteConfirm(false);
      await refetch();
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  // Handle manual trigger
  const handleManualTrigger = async () => {
    if (!schedule?.id) return;

    try {
      setIsTriggering(true);
      await triggerNow(schedule.id);
      onManualTrigger?.(schedule.id);
      await refetch();
    } catch (err) {
      console.error('Failed to trigger sync:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  // Open edit form with current schedule data
  const openEditForm = () => {
    if (schedule) {
      setFormData({
        frequency: schedule.frequency,
        enabled: schedule.enabled,
        time: '02:00',
        dayOfWeek: 0,
        dayOfMonth: 1
      });
      setShowEditForm(true);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sync Scheduler</h3>
              <p className="text-sm text-gray-600">Automated backup scheduling</p>
            </div>
          </div>

          {/* Create Schedule Button */}
          {!schedule && !showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Create Schedule
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Loading State */}
        {loading && !schedule ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader className="w-8 h-8 text-purple-600 animate-spin mb-3" />
            <p className="text-gray-600">Loading schedule...</p>
          </div>
        ) : schedule ? (
          <>
            {/* Current Schedule Display */}
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      schedule.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                    }`}
                  ></div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">
                      {getFrequencyLabel(schedule.frequency)}
                    </h4>
                    <p className="text-xs text-gray-600">
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={() => handleToggleSchedule(!schedule.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    schedule.enabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Schedule Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-gray-600">Next Run</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatFullDate(schedule.nextRun)}
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5">
                    {formatNextRun(schedule.nextRun)}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-gray-600">Last Run</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatFullDate(schedule.lastRun)}
                  </p>
                  {schedule.lastRunStatus && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        schedule.lastRunStatus === 'success'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {schedule.lastRunStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleManualTrigger}
                disabled={isTriggering}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isTriggering ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Now
                  </>
                )}
              </button>

              <button
                onClick={openEditForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>

            {/* Statistics */}
            {showStatistics && (
              <div className="pt-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Schedule Statistics
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium text-blue-600">Total Runs</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{schedule.totalRuns || 0}</p>
                  </div>

                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-xs font-medium text-green-600">Success Rate</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {schedule.successRate ? `${schedule.successRate.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-medium text-purple-600">Avg Duration</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {schedule.averageDuration ? `${schedule.averageDuration}s` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : showCreateForm ? (
          /* Create Schedule Form */
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Create New Schedule</h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as Frequency })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {formData.frequency === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day of Week
                </label>
                <select
                  value={formData.dayOfWeek}
                  onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <option key={day} value={day}>{getDayName(day)}</option>
                  ))}
                </select>
              </div>
            )}

            {formData.frequency === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day of Month
                </label>
                <select
                  value={formData.dayOfMonth}
                  onChange={(e) => setFormData({ ...formData, dayOfMonth: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <label htmlFor="enabled" className="text-sm text-gray-700">
                Enable schedule immediately
              </label>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSchedule}
                className="flex-1 px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium transition-colors"
              >
                Create Schedule
              </button>
            </div>
          </div>
        ) : (
          /* No Schedule */
          <div className="flex flex-col items-center justify-center py-12">
            <Calendar className="w-16 h-16 text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium mb-1">No schedule configured</p>
            <p className="text-sm text-gray-500 mb-4">Create a schedule to automate backups</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Create Schedule
            </button>
          </div>
        )}
      </div>

      {/* Edit Schedule Modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Schedule</h3>
              <button
                onClick={() => setShowEditForm(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value as Frequency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="edit-enabled" className="text-sm text-gray-700">
                  Schedule enabled
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowEditForm(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSchedule}
                className="flex-1 px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Schedule?</h3>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                Deleting this schedule will stop all automated backups. You can create a new schedule at any time.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSchedule}
                className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Delete Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
