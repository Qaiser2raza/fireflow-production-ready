import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-lg font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-gold-500 text-slate-950 hover:bg-gold-400',
    secondary: 'bg-slate-800 text-white hover:bg-slate-700',
    success: 'bg-green-600 text-white hover:bg-green-500',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'bg-transparent text-slate-400 hover:text-white hover:bg-slate-800'
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
};