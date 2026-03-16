import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertCircle, ShieldCheck, Clock } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  downloadUrl?: string;
}

export const SystemUpdatePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetchWithAuth('/api/system/update/check');
      const data = await res.json();
      setUpdateInfo(data);
    } catch (err) {
      console.error('Update check failed', err);
      setStatus({ type: 'error', message: 'Failed to connect to update server.' });
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    
    setLoading(true);
    setStatus({ type: 'info', message: 'Downloading and applying update. Do not close the application.' });
    
    try {
      const res = await fetchWithAuth('/api/system/update/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadUrl: updateInfo.downloadUrl })
      });
      
      const data = await res.json();
      if (data.success) {
        setStatus({ type: 'success', message: 'Update initiated! The system will restart in 5 seconds.' });
      } else {
        throw new Error(data.error || 'Update failed');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to apply update.' });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-2">System Core & Updates</h2>
          <p className="text-slate-500 text-sm max-w-xl">Keep your Fireflow instance secure and feature-rich with remote patching. All data and local configurations are preserved during updates.</p>
        </div>
        <button 
          onClick={checkForUpdates}
          disabled={checking}
          className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking Cloud...' : 'Refresh Build Status'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Version Status Card */}
        <div className="bg-slate-900/40 border-2 border-slate-800/60 rounded-[2.5rem] p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 text-white/5 pointer-events-none group-hover:text-white/10 transition-colors">
            <ShieldCheck size={120} />
          </div>
          
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Current Deployment</p>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-5xl font-black text-white tracking-tighter">v{updateInfo?.currentVersion || '1.0.0'}</h3>
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-black rounded-lg uppercase border border-emerald-500/20">Stable</span>
            </div>
            <p className="text-slate-500 text-xs font-mono">Last checked {new Date().toLocaleTimeString()}</p>
          </div>
        </div>

        {/* Update Action Card */}
        <div className={`rounded-[2.5rem] p-8 border-2 transition-all duration-500 ${updateInfo?.hasUpdate ? 'bg-indigo-600/10 border-indigo-500/40' : 'bg-slate-900/20 border-slate-800/40 opacity-80'}`}>
          <div className="flex justify-between items-start mb-6">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${updateInfo?.hasUpdate ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
              {updateInfo?.hasUpdate ? <Download size={24} /> : <CheckCircle2 size={24} />}
            </div>
          </div>

          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">
            {updateInfo?.hasUpdate ? `New Build v${updateInfo.latestVersion}` : 'System Up to Date'}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            {updateInfo?.hasUpdate 
              ? `A new update is available with performance improvements and bug fixes. Version ${updateInfo.latestVersion} is ready to download.`
              : 'You are running the latest version optimized for your region and hardware.'}
          </p>

          {updateInfo?.hasUpdate && (
            <button 
              onClick={handleApplyUpdate}
              disabled={loading}
              className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all shadow-xl shadow-white/5 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Applying Patch...
                </>
              ) : (
                'Install Now & Restart'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Release Notes */}
      {updateInfo?.hasUpdate && updateInfo.notes && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={18} className="text-slate-400" />
            <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Release Notes</h4>
          </div>
          <div className="prose prose-invert max-w-none text-slate-400 text-sm whitespace-pre-wrap font-mono leading-relaxed bg-black/20 p-6 rounded-2xl border border-white/5">
            {updateInfo.notes}
          </div>
        </div>
      )}

      {/* Status Toasts/Alerts */}
      {status && (
        <div className={`p-6 rounded-3xl flex items-start gap-4 animate-in slide-in-from-top-4 duration-300 ${
          status.type === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-500' : 
          status.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' :
          'bg-blue-500/10 border border-blue-500/20 text-blue-500'
        }`}>
          {status.type === 'error' ? <AlertCircle className="shrink-0" size={20} /> : <CheckCircle2 className="shrink-0" size={20} />}
          <div>
            <p className="text-xs font-black uppercase tracking-widest mb-1">{status.type === 'error' ? 'Security/Network Error' : 'System Message'}</p>
            <p className="text-sm font-medium opacity-90">{status.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};
