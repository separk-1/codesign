import React from 'react';

export const FormattedText = ({ text }: { text: string }) => {
  if (!text) return null;

  // Split by bold markers (**text**)
  // The capturing group includes the delimiters in the result array
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          // Remove the ** delimiters and wrap in strong
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </>
  );
};
