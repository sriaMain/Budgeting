import React, { useState } from 'react';
import { X } from 'lucide-react';

interface SkillsInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const parseSkills = (value: string): string[] =>
  value.split(',').map((s) => s.trim()).filter(Boolean);

/** Comma-separated string in, comma-separated string out - the underlying
 * "skills" field stays a plain TextField (no backend/schema change), this
 * just gives the freelancer a type-one-press-Enter-repeat tag UI instead of
 * a raw textarea. */
export const SkillsInput: React.FC<SkillsInputProps> = ({
  label, value, onChange, placeholder = 'Type a skill and press Enter', disabled,
}) => {
  const [draft, setDraft] = useState('');
  const skills = parseSkills(value);

  const commitDraft = () => {
    const skill = draft.trim();
    setDraft('');
    if (!skill) return;
    if (skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    onChange([...skills, skill].join(', '));
  };

  const removeSkill = (skill: string) => {
    onChange(skills.filter((s) => s !== skill).join(', '));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && skills.length > 0) {
      removeSkill(skills[skills.length - 1]);
    }
  };

  return (
    <div className="w-full mb-5">
      {label && <label className="block text-base font-medium text-gray-900 mb-2">{label}</label>}
      <div
        className={`w-full min-h-[3.25rem] px-3 py-2 bg-input-bg rounded-lg shadow-[0_2px_5px_rgba(0,0,0,0.03)] flex flex-wrap items-center gap-2 transition-all ${
          disabled ? 'opacity-50' : 'focus-within:ring-2 focus-within:ring-brand-800 focus-within:bg-white'
        }`}
      >
        {skills.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-1 bg-blue-100 text-blue-700 text-sm font-medium pl-2.5 pr-1.5 py-1 rounded-full"
          >
            {skill}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                className="hover:text-red-600 rounded-full"
                aria-label={`Remove ${skill}`}
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitDraft}
            placeholder={skills.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[8rem] bg-transparent outline-none text-gray-900 placeholder-gray-400 py-1"
          />
        )}
      </div>
    </div>
  );
};
