import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { downloadReport, type ReportType, type ReportParams } from '@/lib/services/reportService';
import { supabase } from '@/lib/supabase/client';
import { FileDown, Loader2, AlertCircle, CheckCircle2, User, Workflow, FolderKanban, Building2, Calendar, Filter } from 'lucide-react';
import type { UserWithRole } from '@/lib/supabase/types';

interface Project {
  id: string;
  name: string;
}

export function Reports() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const [reportType, setReportType] = useState<ReportType>('user_performance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filter states
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data for dropdowns
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Authorization check
  useEffect(() => {
    if (!permissions.canViewReports) {
      navigate('/dashboard');
    }
  }, [permissions.canViewReports, navigate]);

  // Fetch users and projects for dropdowns
  useEffect(() => {
    if (!permissions.canViewReports) return;

    async function fetchData() {
      try {
        setLoadingData(true);

        // Fetch users
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, full_name, email, role_id, roles:roles!users_role_id_fkey(*)')
          .is('deleted_at', null)
          .order('full_name');

        if (usersError) throw usersError;

        // Transform users data
        const transformedUsers = (usersData ?? []).map((u: any) => ({
          ...u,
          roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
        })) as UserWithRole[];

        setUsers(transformedUsers);

        // Fetch projects
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('id, name')
          .order('name');

        if (projectsError) throw projectsError;
        setProjects(projectsData ?? []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load users and projects');
      } finally {
        setLoadingData(false);
      }
    }

    fetchData();
  }, [permissions.canViewReports]);

  // Reset filters when report type changes
  useEffect(() => {
    setSelectedUserId('');
    setSelectedProjectId('');
    setDateFrom('');
    setDateTo('');
    setError(null);
    setSuccess(null);
  }, [reportType]);

  const handleGenerateReport = async () => {
    if (!permissions.canViewReports) {
      setError('Unauthorized. Super Admin access required.');
      return;
    }

    // Validation
    if (reportType === 'user_performance' && !selectedUserId) {
      setError('Please select a user for the User Performance Report');
      return;
    }

    if (reportType === 'project' && !selectedProjectId) {
      setError('Please select a project for the Project Report');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('Start date must be before end date');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const params: ReportParams = {
        reportType,
        ...(selectedUserId && { userId: selectedUserId }),
        ...(selectedProjectId && { projectId: selectedProjectId }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      };

      const result = await downloadReport(params);

      if (result.success) {
        setSuccess('Report generated and downloaded successfully');
        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(result.error?.message ?? 'Failed to generate report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Don't render if not authorized
  if (!permissions.canViewReports) {
    return null;
  }

  const getReportTypeIcon = (type: ReportType) => {
    switch (type) {
      case 'user_performance':
        return <User className="h-5 w-5" />;
      case 'task_lifecycle':
        return <Workflow className="h-5 w-5" />;
      case 'project':
        return <FolderKanban className="h-5 w-5" />;
      case 'company_wide':
        return <Building2 className="h-5 w-5" />;
      default:
        return <FileDown className="h-5 w-5" />;
    }
  };

  const getReportTypeDescription = (type: ReportType) => {
    switch (type) {
      case 'user_performance':
        return 'Detailed performance analysis for individual users with task statistics and productivity metrics.';
      case 'task_lifecycle':
        return 'Comprehensive analysis of task flow and efficiency across lifecycle stages and bottlenecks.';
      case 'project':
        return 'Complete project overview with task breakdown, team contributions, and progress metrics.';
      case 'company_wide':
        return 'Executive-level summary with organization-wide metrics, trends, and key performance indicators.';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">

      <Card className="border-2 shadow-lg w-full">
        <CardHeader className="pb-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <FileDown className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg sm:text-xl break-words">Generate PDF Report</CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm break-words">
                Select a report type and configure filters to generate your report
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
          {/* Report Type Selector */}
          <div className="space-y-3">
            <Label htmlFor="reportType" className="text-base font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Report Type
            </Label>
            <Select
              id="reportType"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              disabled={loading}
              className="w-full"
            >
              <option value="user_performance">User Performance Report</option>
              <option value="task_lifecycle">Task Lifecycle Report</option>
              <option value="project">Project Report</option>
              <option value="company_wide">Company-Wide Executive Report</option>
            </Select>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="mt-0.5 text-muted-foreground">
                {getReportTypeIcon(reportType)}
              </div>
              <p className="text-sm text-muted-foreground flex-1">
                {getReportTypeDescription(reportType)}
              </p>
            </div>
          </div>

          {/* Dynamic Filters */}
          <div className="space-y-4 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {/* User filter (for user_performance report) */}
              {reportType === 'user_performance' && (
                <div className="space-y-2">
                  <Label htmlFor="userId" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    User <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    id="userId"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={loading || loadingData}
                    required
                    className="w-full min-h-[44px]"
                  >
                    <option value="">Select a user...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name ?? user.email}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Project filter (for project report) */}
              {reportType === 'project' && (
                <div className="space-y-2">
                  <Label htmlFor="projectId" className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4" />
                    Project <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    id="projectId"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={loading || loadingData}
                    required
                    className="w-full min-h-[44px]"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Project filter (optional for other reports) */}
              {(reportType === 'user_performance' || reportType === 'task_lifecycle') && (
                <div className="space-y-2">
                  <Label htmlFor="projectFilter" className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4" />
                    Project <span className="text-xs text-muted-foreground">(Optional)</span>
                  </Label>
                  <Select
                    id="projectFilter"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={loading || loadingData}
                    className="w-full min-h-[44px]"
                  >
                    <option value="">All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Date range filters */}
              <div className="space-y-2">
                <Label htmlFor="dateFrom" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date From <span className="text-xs text-muted-foreground">(Optional)</span>
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={loading}
                  className="w-full min-h-[44px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateTo" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date To <span className="text-xs text-muted-foreground">(Optional)</span>
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={loading}
                  min={dateFrom || undefined}
                  className="w-full min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm flex-1">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-start gap-3 p-4 bg-muted text-foreground rounded-lg border border-border animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm flex-1">{success}</p>
            </div>
          )}

          {/* Generate Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t">
            <Button
              onClick={handleGenerateReport}
              disabled={loading || loadingData}
              className="w-full sm:w-auto sm:min-w-[200px] min-h-[44px]"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Generate PDF Report
                </>
              )}
            </Button>
            {loading && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Please wait while your report is being generated...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
