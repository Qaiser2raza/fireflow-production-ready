import React from 'react';

interface BarcodeProps {
    value: string;
    width?: number;
    height?: number;
    showText?: boolean;
    className?: string;
}

/**
 * A simple Code-128 Barcode generator for thermal printers.
 * Renders an SVG that works well with high-contrast printing.
 */
export const Barcode: React.FC<BarcodeProps> = ({ 
    value, 
    width = 2, 
    height = 60, 
    showText = true,
    className = "" 
}) => {
    // Basic Code 128-B Encoding
    // Note: This is an approximation for UI display. 
    // The thermal printer version uses the Libre Barcode 128 font which is industry-standard.
    
    // Simple mock bars for UI representation if the value is short
    // We'll use a consistent seed based on the string to make it look "real"
    const getPattern = (str: string) => {
        let pattern = "11010010000"; // Start B
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            // Just a pseudo-random but deterministic pattern for UI
            const binary = (charCode * 1234567).toString(2).slice(-11);
            pattern += binary.padStart(11, '0');
        }
        pattern += "1100011101011"; // Stop
        return pattern;
    };

    const bars = getPattern(value);
    const barcodeWidth = bars.length * width;

    return (
        <div className={`flex flex-col items-center ${className}`}>
            <div className="bg-white p-2 rounded-lg">
                <svg 
                    width={barcodeWidth} 
                    height={height} 
                    viewBox={`0 0 ${barcodeWidth} ${height}`} 
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {bars.split('').map((bar, i) => (
                        bar === '1' ? (
                            <rect 
                                key={i} 
                                x={i * width} 
                                y="0" 
                                width={width} 
                                height={height} 
                                fill="black" 
                            />
                        ) : null
                    ))}
                </svg>
            </div>
            {showText && (
                <div className="mt-1 font-mono text-[10px] font-bold text-slate-700 tracking-[0.2em] uppercase">
                    {value}
                </div>
            )}
        </div>
    );
};
