import React, { useEffect } from 'react';

export interface GismatModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  headerTheme?: 'dark' | 'light' | 'blue';
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  maxWidthClass?: string;
  maxHeightClass?: string;
  dataPurpose?: string;
}

export const GismatModal: React.FC<GismatModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  icon,
  headerTheme = 'dark',
  headerActions,
  footer,
  children,
  id,
  maxWidthClass = 'w-[94vw] sm:w-[78vw] md:w-[64vw] lg:w-[58vw] max-w-[850px]',
  maxHeightClass = 'max-h-[82vh]',
  dataPurpose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDarkHeader = headerTheme === 'dark';
  const isBlueHeader = headerTheme === 'blue';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[2.5px] flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto animate-in fade-in duration-150"
      id={id}
      data-purpose={dataPurpose || 'gismat-modal-backdrop'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`bg-white ${maxWidthClass} ${maxHeightClass} rounded-2xl shadow-2xl overflow-hidden border border-slate-200/90 flex flex-col my-auto relative animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        {(title || icon || badge) && (
          <div
            className={`px-5 py-3.5 flex items-start justify-between shrink-0 border-b ${
              isDarkHeader
                ? 'bg-[#18151f] text-white border-slate-700/80'
                : isBlueHeader
                ? 'bg-[#1565c0] text-white border-blue-600'
                : 'bg-white text-slate-800 border-slate-100'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 pr-4">
              {icon && <div className="shrink-0">{icon}</div>}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {title && (
                    <h3
                      className={`text-sm sm:text-base font-bold truncate ${
                        isDarkHeader || isBlueHeader ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {title}
                    </h3>
                  )}
                  {badge && <div className="shrink-0">{badge}</div>}
                </div>
                {subtitle && (
                  <p
                    className={`text-xs mt-0.5 line-clamp-1 ${
                      isDarkHeader
                        ? 'text-slate-400'
                        : isBlueHeader
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Header Right Actions & Close X Button */}
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {headerActions}
              <button
                type="button"
                aria-label="Cerrar modal"
                title="Cerrar"
                onClick={onClose}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition cursor-pointer ${
                  isDarkHeader
                    ? 'text-slate-400 hover:text-white hover:bg-white/10'
                    : isBlueHeader
                    ? 'text-blue-200 hover:text-white hover:bg-white/15'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-white">
          {children}
        </div>

        {/* Modal Footer (if provided) */}
        {footer && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
