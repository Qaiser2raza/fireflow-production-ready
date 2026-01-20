import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  className = ''
}) => {
  const variants = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    success: 'bg-green-500/10 text-green-500 border-green-500/30',
    warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    danger: 'bg-red-500/10 text-red-500 border-red-500/30',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/30'
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};