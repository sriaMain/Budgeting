import React, { useRef, useEffect, useState } from 'react';
import { InputField } from './InputField';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}

const OtpInput: React.FC<OtpInputProps> = ({ length = 4, value, onChange }) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Initialize refs array
  useEffect(() => {
    inputsRef.current = inputsRef.current.slice(0, length);
  }, [length]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const newValue = e.target.value;
    
    // Allow only numbers
    if (!/^\d*$/.test(newValue)) return;

    const lastChar = newValue.slice(-1);
    const otpArray = value.split('');
    otpArray[index] = lastChar;
    const newOtp = otpArray.join('').slice(0, length);

    onChange(newOtp);

    // Move to next input if value is entered
    if (newValue && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const otpArray = value.split('');
      
      if (otpArray[index]) {
        // If current input has value, clear it
        otpArray[index] = '';
        onChange(otpArray.join(''));
      } else if (index > 0) {
        // If empty, move previous and clear that
        inputsRef.current[index - 1]?.focus();
        setActiveIndex(index - 1);
        otpArray[index - 1] = '';
        onChange(otpArray.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
      setActiveIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, length);
    if (/^\d+$/.test(pastedData)) {
      onChange(pastedData);
      // Focus the last filled input or the next empty one
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputsRef.current[focusIndex]?.focus();
      setActiveIndex(focusIndex);
    }
  };

  const handleFocus = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="flex gap-4 justify-center my-8">
      {Array.from({ length }).map((_, index) => {
        const isActive = activeIndex === index;
        const hasValue = Boolean(value[index]);
        
        // Styling logic based on state to match the image reference
        // Image: Active = White bg + Blue Border. Inactive/Empty = Gray bg.
        let baseClasses = "w-16 h-16 rounded-full text-2xl font-semibold text-center transition-all duration-200 outline-none caret-blue-600";
        
        let stateClasses = "";
        if (isActive) {
            // Focused state: White background, Blue border
            stateClasses = "bg-white border-2 border-blue-700 text-gray-900 shadow-[0_0_0_1px_rgba(29,78,216,0.1)]";
        } else if (hasValue) {
            // Filled but not focused: White background, Gray border (or keep simple)
             stateClasses = "bg-white border border-gray-300 text-gray-900";
        } else {
            // Empty and not focused: Gray background
             stateClasses = "bg-gray-200 border-transparent text-transparent";
        }

        return (
          <InputField
          
            key={index}
            ref={(el) => { inputsRef.current[index] = el; }}
            type="text" // Using text to allow better control over cursor and selection, manually validating numbers
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            onFocus={() => handleFocus(index)}
            className={`${baseClasses} ${stateClasses}`}
            aria-label={`Digit ${index + 1} of verification code`}
          />
        );
      })}
    </div>
  );
};

export default OtpInput;