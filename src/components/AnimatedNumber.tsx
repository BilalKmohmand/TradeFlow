import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  format?: 'currency' | 'tons' | 'integer' | 'decimal';
  className?: string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = 'integer',
  className = '',
}) => {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const [displayValue, setDisplayValue] = useState<string>('');

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      const num = typeof latest === 'number' ? latest : parseFloat(String(latest)) || 0;
      if (format === 'currency') {
        setDisplayValue(
          new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            currencyDisplay: 'symbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(Math.round(num))
        );
      } else if (format === 'tons') {
        setDisplayValue(
          `${new Intl.NumberFormat('en-PK', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(num)} T`
        );
      } else if (format === 'decimal') {
        setDisplayValue(
          new Intl.NumberFormat('en-PK', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          }).format(num)
        );
      } else {
        setDisplayValue(new Intl.NumberFormat('en-PK').format(Math.round(num)));
      }
    });

    return () => unsubscribe();
  }, [spring, format]);

  return <motion.span className={className}>{displayValue || (format === 'currency' ? `Rs.${new Intl.NumberFormat('en-PK').format(Math.round(value))}` : value)}</motion.span>;
};
