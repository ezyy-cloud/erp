import { useState, memo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePage } from '@/contexts/PageContext';
import { Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useRealtimeProjects } from '@/hooks/useRealtimeProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router-dom';
import { getProjectStatusDisplay } from '@/lib/utils/taskDisplay';
import type { Project } from '@/lib/supabase/types';
import { Skeleton, SkeletonProjectCard } from '@/components/skeletons';

// Memoized project list item component
const ProjectListItem = memo(({ project }: { project: Project }) => {
  const statusDisplay = getProjectStatusDisplay(project.status);
  const StatusIcon = statusDisplay.icon;
  
  return (
    <Link
      key={project.id}
      to={`/projects/${project.id}`}
      className="block h-full"
    >
      <Card className="h-full flex flex-col hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer group">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg flex-1 group-hover:text-primary transition-colors line-clamp-2">
              {project.name}
            </CardTitle>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 ${statusDisplay.bgColor} ${statusDisplay.color}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{statusDisplay.label}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
            {project.description ?? 'No description'}
          </p>
          <div className="mt-4 text-xs text-muted-foreground flex-shrink-0">
            Created {new Date(project.created_at).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});

ProjectListItem.displayName = 'ProjectListItem';

export function Projects() {
  const { permissions } = useAuth();
  const { setActionButton } = usePage();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Use real-time projects hook
  const { projects, loading } = useRealtimeProjects();

  // Set action button in top bar
  useEffect(() => {
    if (permissions.canCreateProjects) {
      setActionButton(
        <>
          {/* Mobile: Icon button */}
          <Button 
            onClick={() => setShowCreateForm((prev) => !prev)}
            size="icon"
            variant="ghost"
            className="h-10 w-10 p-0 lg:hidden"
          >
            {showCreateForm ? (
              <X className="h-8 w-8" />
            ) : (
              <Plus className="h-8 w-8" />
            )}
          </Button>
          {/* Desktop: Full button with text */}
          <Button 
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="hidden lg:flex min-h-[44px]"
          >
            {showCreateForm ? 'Cancel' : 'New Project'}
          </Button>
        </>
      );
    } else {
      setActionButton(null);
    }
    
    return () => setActionButton(null);
  }, [permissions.canCreateProjects, showCreateForm, setActionButton]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only Admin and Super Admin can create projects
    if (!permissions.canCreateProjects) {
      alert('Only Admins and Super Admins can create projects.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // @ts-expect-error - Supabase type inference issue with strict TypeScript
      const { error } = await supabase.from('projects').insert({
        name: formData.name,
        description: formData.description || null,
        created_by: user.id,
      });

      if (error) throw error;

      setFormData({ name: '', description: '' });
      setShowCreateForm(false);
      // Projects will update automatically via real-time subscription
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton height={32} width="20%" variant="text" />
          <Skeleton height={40} width={140} variant="rectangular" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonProjectCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {showCreateForm && permissions.canCreateProjects && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter project description"
                  rows={4}
                />
              </div>
              <Button type="submit">Create Project</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No projects found. {permissions.canCreateProjects && 'Create your first project to get started.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectListItem key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
