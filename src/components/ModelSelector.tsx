import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, ChevronRight } from 'lucide-react';

export interface SelectableModel {
  id: string;
  name: string;
  enabled: number;
}

function stripThinking(modelStr: string) {
  return (modelStr || '').replace(/-thinking$/, '');
}

function withThinking(base: string, thinking: boolean) {
  return thinking ? `${base}-thinking` : base;
}

function isThinking(modelStr: string) {
  return typeof modelStr === 'string' && modelStr.endsWith('-thinking');
}

interface ModelSelectorProps {
  currentModelString: string;
  models: SelectableModel[];
  onModelChange: (newModelString: string) => void;
  isNewChat?: boolean;
  dropdownPosition?: 'top' | 'bottom';
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModelString,
  models,
  onModelChange,
  dropdownPosition,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentBase = stripThinking(currentModelString);
  const thinking = isThinking(currentModelString);
  const currentModel = models.find(m => m && m.id === currentBase);
  const currentLabel = currentModel ? currentModel.name : currentBase || 'Model';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(dropdownPosition === 'top' ? true : (dropdownPosition === 'bottom' ? false : spaceBelow < 280));
    }
    setIsOpen(!isOpen);
  };

  const handleSelectModel = (baseId: string, enabled: number) => {
    if (!enabled) return;
    onModelChange(withThinking(baseId, thinking));
    setIsOpen(false);
  };

  const handleToggleThinking = () => {
    onModelChange(withThinking(currentBase, !thinking));
  };

  return (
    <div className="relative inline-block text-right" ref={containerRef}>
      <button
        onClick={handleToggleOpen}
        className="flex items-center gap-1.5 text-[15px] font-medium text-claude-text hover:bg-claude-hover px-3 py-2 rounded-md transition-colors"
      >
        <span>{currentLabel}</span>
        {thinking && <span className="text-claude-textSecondary font-normal">Extended</span>}
        <ChevronDown size={14} className="text-claude-textSecondary" />
      </button>

      {isOpen && (
        <div className={`absolute ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 w-[260px] bg-claude-input rounded-xl shadow-xl border border-claude-border z-50 overflow-hidden py-1 text-left`}>
          {(models || []).slice(0, 3).map(m => {
            if (!m) return null;
            const active = currentBase === m.id;
            const disabled = Number(m.enabled) !== 1;

            const n = (m.name || '').toLowerCase();
            let desc = m.id;
            if (n.includes('opus')) desc = 'Most capable for ambitious work';
            else if (n.includes('sonnet')) desc = 'Most efficient for everyday tasks';
            else if (n.includes('haiku')) desc = 'Fastest for quick answers';

            return (
              <button
                key={m.id || Math.random()}
                onClick={() => handleSelectModel(m.id, m.enabled)}
                disabled={disabled}
                className={`w-full px-4 py-2 flex items-center justify-between text-left ${disabled ? 'opacity-45 cursor-not-allowed' : 'hover:bg-claude-hover cursor-pointer'}`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[14.5px] font-[450] text-claude-text">{m.name}</div>
                  </div>
                  <div className="text-[13px] text-claude-textSecondary mt-0.5">{desc}{disabled ? ' · 断供' : ''}</div>
                </div>
                {active && <Check size={18} className="text-[#3b82f6] ml-2 shrink-0" />}
              </button>
            );
          })}

          <div className="h-[1px] bg-claude-border my-1 mx-4" />

          <div className="px-4 py-2 flex items-center justify-between hover:bg-claude-hover text-left select-none cursor-pointer">
            <div className="flex-1">
              <div className="text-[14.5px] font-[450] text-claude-text">Extended thinking</div>
              <div className="text-[13px] text-claude-textSecondary mt-0.5">Think longer for complex tasks</div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleThinking();
              }}
              className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${thinking ? 'bg-[#3A6FE0]' : 'bg-claude-border'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${thinking ? 'left-5' : 'left-1'}`} />
            </button>
          </div>

          <div className="h-[1px] bg-claude-border my-1 mx-4" />

          <div className="px-4 py-2 flex items-center justify-between hover:bg-claude-hover text-left select-none cursor-pointer text-claude-text mb-1">
            <span className="text-[14.5px] font-[450]">More models</span>
            <ChevronRight size={16} className="text-claude-textSecondary" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;

