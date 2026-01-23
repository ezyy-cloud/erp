import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePage } from '@/contexts/PageContext';
import { supabase } from '@/lib/supabase/client';
import { UserAvatar } from '@/components/users/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Camera, Save, X, CheckCircle2, AlertCircle, BarChart3, ArrowLeft } from 'lucide-react';
import { calculateProductivityScore, type ProductivityScore } from '@/lib/services/userPerformanceService';

export function Profile() {
  const navigate = useNavigate();
  const { user, appUser, permissions } = useAuth();
  const { themePreference, setThemePreference } = useTheme();
  const { setBackButton } = usePage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Productivity score state
  const [productivityScore, setProductivityScore] = useState<ProductivityScore | null>(null);
  const [loadingScore, setLoadingScore] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localThemePreference, setLocalThemePreference] = useState<'light' | 'dark' | 'system'>('system');

  // Track original values to detect changes
  const [originalValues, setOriginalValues] = useState({
    fullName: '',
    email: '',
    avatarUrl: null as string | null,
    themePreference: 'system' as 'light' | 'dark' | 'system',
  });

  // Load user data
  useEffect(() => {
    if (appUser) {
      const userThemePreference = (appUser as any).theme_preference ?? themePreference ?? 'system';
      setFullName(appUser.full_name ?? '');
      setEmail(appUser.email ?? '');
      setAvatarUrl(appUser.avatar_url ?? null);
      setLocalThemePreference(userThemePreference);
      setOriginalValues({
        fullName: appUser.full_name ?? '',
        email: appUser.email ?? '',
        avatarUrl: appUser.avatar_url ?? null,
        themePreference: userThemePreference,
      });
    }
  }, [appUser, themePreference]);

  // Set back button in top nav
  useEffect(() => {
    setBackButton(
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => navigate('/dashboard')}
        className="h-10 w-10"
        aria-label="Back to dashboard"
      >
        <ArrowLeft className="h-10 w-10" />
      </Button>
    );
    return () => {
      setBackButton(null);
    };
  }, [navigate, setBackButton]);

  // Load productivity score for non-admin users
  useEffect(() => {
    if (user && !permissions.canViewAllUsers) {
      setLoadingScore(true);
      calculateProductivityScore(user.id)
        .then((result) => {
          if (result.data) {
            setProductivityScore(result.data);
          }
        })
        .catch((err) => {
          console.error('Error loading productivity score:', err);
        })
        .finally(() => {
          setLoadingScore(false);
        });
    }
  }, [user, permissions.canViewAllUsers]);

  // Check if there are unsaved changes
  const hasChanges = () => {
    return (
      fullName !== originalValues.fullName ||
      email !== originalValues.email ||
      (avatarUrl !== originalValues.avatarUrl && !selectedFile) ||
      selectedFile !== null ||
      localThemePreference !== originalValues.themePreference
    );
  };

  // Handle avatar file selection
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle avatar upload
  const handleAvatarUpload = async () => {
    if (!selectedFile || !user) return;

    try {
      setLoading(true);
      setError(null);

      // Delete old avatar if exists
      if (avatarUrl && avatarUrl.startsWith('avatars/')) {
        try {
          // Remove 'avatars/' prefix for storage API
          const path = avatarUrl.replace('avatars/', '');
          await supabase.storage.from('avatars').remove([path]);
        } catch {
          // Ignore errors when deleting old avatar
        }
      }

      // Upload new avatar
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, selectedFile, {
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Store path with bucket prefix for consistency
      const filePath = `avatars/${fileName}`;

      // Update user record with new avatar URL
      const { error: updateError } = await (supabase.from('users') as any)
        .update({ avatar_url: filePath })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(filePath);
      setOriginalValues((prev) => ({ ...prev, avatarUrl: filePath }));
      setSelectedFile(null);
      setAvatarPreview(null);
      
      // Refresh appUser data
      window.location.reload(); // Simple refresh to update avatar
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      setError(err.message ?? 'Failed to upload avatar');
    } finally {
      setLoading(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const updates: Record<string, any> = {};

      // Update full name if changed
      if (fullName !== originalValues.fullName) {
        updates.full_name = fullName || null;
      }

      // Update email if changed (note: this only updates public.users, not auth.users)
      if (email !== originalValues.email) {
        updates.email = email;
      }

      // Update theme preference if changed
      if (localThemePreference !== originalValues.themePreference) {
        updates.theme_preference = localThemePreference;
        // Also update the theme context
        await setThemePreference(localThemePreference);
      }

      // Upload avatar if a new file was selected
      if (selectedFile) {
        await handleAvatarUpload();
      }

      // Update user record
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await (supabase.from('users') as any)
          .update(updates)
          .eq('id', user.id);

        if (updateError) throw updateError;
      }

      // Update original values
      setOriginalValues({
        fullName,
        email,
        avatarUrl: selectedFile ? avatarUrl : originalValues.avatarUrl,
        themePreference: localThemePreference,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Refresh appUser data
      if (appUser) {
        // Trigger a refresh by updating appUser state
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (data) {
          // The AuthContext will pick up the changes on next render
          window.location.reload();
        }
      }
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (appUser) {
      setFullName(originalValues.fullName);
      setEmail(originalValues.email);
      setAvatarUrl(originalValues.avatarUrl);
      setLocalThemePreference(originalValues.themePreference);
      setSelectedFile(null);
      setAvatarPreview(null);
      setError(null);
    }
  };

  if (!user || !appUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-800 dark:text-green-200">
            Profile updated successfully
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Productivity Score Card (for non-admin users) */}
      {!permissions.canViewAllUsers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Productivity Score
            </CardTitle>
            <CardDescription>
              Your performance score based on completion rate, timeliness, consistency, and review approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingScore ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : productivityScore ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold mb-2">
                      {productivityScore.productivity_score.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Out of 100</div>
                  </div>
                  <div className="w-24 h-24 relative">
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="42"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        className="text-muted"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="42"
                        stroke="currentColor"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${(productivityScore.productivity_score / 100) * 264} 264`}
                        className="text-primary"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold">
                        {productivityScore.productivity_score.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Completion Rate</div>
                    <div className="text-lg font-semibold">
                      {productivityScore.breakdown.completion_rate.value.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {productivityScore.breakdown.completion_rate.weight}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Timeliness</div>
                    <div className="text-lg font-semibold">
                      {productivityScore.breakdown.timeliness.value.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {productivityScore.breakdown.timeliness.weight}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Consistency</div>
                    <div className="text-lg font-semibold">
                      {productivityScore.breakdown.consistency.value.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {productivityScore.breakdown.consistency.weight}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Review Approval</div>
                    <div className="text-lg font-semibold">
                      {productivityScore.breakdown.review_approval.value.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Weight: {productivityScore.breakdown.review_approval.weight}%
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Unable to load productivity score</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="h-24 w-24 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <UserAvatar size="xl" />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </div>
              {selectedFile && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAvatarUpload}
                    disabled={loading}
                  >
                    Upload
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setAvatarPreview(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Click the camera icon to upload a new profile picture
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Email changes require admin approval
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preferences & Role */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Customize your app experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Theme Preference */}
            <div className="space-y-2">
              <Label htmlFor="themePreference">Theme Preference</Label>
              <Select
                id="themePreference"
                value={localThemePreference}
                onChange={(e) => setLocalThemePreference(e.target.value as 'light' | 'dark' | 'system')}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose your preferred color theme. System follows your OS preference.
              </p>
            </div>

            {/* Role Information (Read-only) */}
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="px-3 py-2 rounded-md border bg-muted/50">
                <p className="text-sm font-medium">
                  {appUser.roles?.name ?? 'No role assigned'}
                </p>
                {appUser.roles?.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {appUser.roles.description}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Role is managed by administrators
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!hasChanges() || saving}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!hasChanges() || saving || loading}
        >
          {saving ? (
            <>
              <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
