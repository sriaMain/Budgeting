import React, { useRef, useEffect, useCallback, useState } from 'react';
import { RefreshIcon } from '../components/Icons';
import type { CaptchaProps } from '../types';

export const Captcha: React.FC<CaptchaProps> = ({ onCaptchaChange, refreshCounter }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const generateRandomString = (length: number) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // Removed ambiguous chars like I, l, 1, O, 0
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const drawCaptcha = useCallback((text: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Config
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#f9fafb'; // gray-50
    ctx.fillRect(0, 0, width, height);

    // Add noise (dots)
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100}, 0.2)`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Add noise (lines)
    for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = `rgba(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100}, 0.15)`;
        ctx.lineWidth = 1 + Math.random();
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
    }

    // Draw Text
    const fontSize = 28;
    ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
    ctx.textBaseline = 'middle';
    
    const totalWidthEstimate = ctx.measureText(text).width + (text.length * 10);
    let startX = (width - totalWidthEstimate) / 2;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      ctx.save();
      // Position
      const x = startX + (i * 35); // spacing
      const y = height / 2;
      
      // Transform
      ctx.translate(x, y);
      const rotation = (Math.random() - 0.5) * 0.4; // Random rotation -0.2 to 0.2 radians
      ctx.rotate(rotation);
      
      // Style
      ctx.fillStyle = `rgb(${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 150)}, ${Math.floor(Math.random() * 150)})`;
      
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }

  }, []);

  const regenerate = useCallback(() => {
    setIsRegenerating(true);
    const newToken = generateRandomString(6);
    drawCaptcha(newToken);
    onCaptchaChange(newToken);
    
    // Small timeout for visual feedback on the button
    setTimeout(() => setIsRegenerating(false), 400);
  }, [drawCaptcha, onCaptchaChange]);

  // Initial load
  useEffect(() => {
    regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Regenerate when parent increments refreshCounter
  useEffect(() => {
    if (typeof refreshCounter !== 'undefined') {
      regenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCounter]);

  return (
    <div className="flex items-center space-x-3 select-none">
      <div className="relative overflow-hidden rounded-lg border border-gray-300 shadow-sm">
        <canvas 
            ref={canvasRef} 
            width={240} 
            height={60} 
            className="block bg-gray-50 cursor-pointer"
            onClick={regenerate}
            title="Click to refresh captcha"
        />
      </div>
      <button
        type="button"
        onClick={regenerate}
        className={`p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isRegenerating ? 'rotate-180' : ''}`}
        title="Refresh Captcha"
      >
        <RefreshIcon className="w-6 h-6" />
      </button>
    </div>
  );
};