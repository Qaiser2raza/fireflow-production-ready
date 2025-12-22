import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`bg-slate-900 rounded-xl border border-slate-800 ${sizes[size]} w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in duration-200`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="text-xl font-serif font-bold uppercase tracking-widest text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {children}
        </div>
        {footer && (
          <div className="p-6 border-t border-slate-800 flex gap-3 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};