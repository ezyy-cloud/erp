/**
 * Report Service
 * Handles PDF report generation via Supabase Edge Functions (data) + client-side PDF generation
 * Super Admin only
 */

import { supabase } from '@/lib/supabase/client';
import { generatePDFFromData } from './pdfGenerator';
import { validateReportData } from './reportSchemas';

export type ReportType = 'user_performance' | 'task_lifecycle' | 'project' | 'company_wide';

export interface ReportParams {
  reportType: ReportType;
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ReportGenerationResult {
  success: boolean;
  error: Error | null;
  blob?: Blob;
  filename?: string;
}

/**
 * Generate a PDF report
 * @param params Report parameters
 * @returns Result with PDF blob or error
 */
export async function generateReport(
  params: ReportParams
): Promise<ReportGenerationResult> {
  try {
    // Get the Supabase URL and anon key from the client
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: new Error('Missing Supabase configuration'),
      };
    }

    // Get the current session and refresh it to ensure we have a valid token
    let { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !currentSession) {
      return {
        success: false,
        error: new Error('Not authenticated. Please log in.'),
      };
    }

    // Refresh the session to ensure we have a valid token
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession(currentSession);
    
    if (refreshError || !refreshedSession) {
      console.warn('Failed to refresh session, using existing token:', refreshError);
      // Continue with existing session if refresh fails
    } else {
      currentSession = refreshedSession;
    }

    // Call the Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/generate-report`;
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || 'Unknown error' };
      }
      
      return {
        success: false,
        error: new Error(errorData.error ?? errorData.message ?? `HTTP ${response.status}: ${response.statusText}`),
      };
    }

    // Get the report data as JSON
    const reportData = await response.json();
    
    // Validate data before generating PDF
    const validation = validateReportData(reportData);
    if (!validation.valid) {
      return {
        success: false,
        error: new Error(`Invalid report data: ${validation.error}`),
      };
    }
    
    // Generate PDF client-side
    const pdfBytes = await generatePDFFromData(reportData);
    const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
    
    // Generate filename from report title
    const filename = `${reportData.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    return {
      success: true,
      error: null,
      blob,
      filename,
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}

/**
 * Download a PDF report
 * Opens a download dialog for the generated PDF
 */
export async function downloadReport(params: ReportParams): Promise<ReportGenerationResult> {
  const result = await generateReport(params);
  
  if (!result.success || !result.blob) {
    return result;
  }

  try {
    // Create a download link
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename ?? 'report.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
}
