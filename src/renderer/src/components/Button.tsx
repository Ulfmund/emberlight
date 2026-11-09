import { motion, type HTMLMotionProps } from 'motion/react'
import { Icon } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:
    'text-ink-950 font-semibold bg-gradient-to-b from-gold-300 via-gold-400 to-gold-500 border border-gold-200/60 ' +
    'shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_8px_30px_-6px_rgb(255_140_40/0.55),inset_0_1px_0_rgb(255_255_255/0.5)] ' +
    'hover:shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_10px_40px_-4px_rgb(255_150_50/0.75),inset_0_1px_0_rgb(255_255_255/0.6)]',
  secondary:
    'text-parchment-100 bg-ink-800/80 border border-gold-500/35 hover:border-gold-400/70 hover:bg-ink-700/80 ' +
    'shadow-[inset_0_1px_0_rgb(255_230_180/0.06)]',
  ghost: 'text-parchment-200 hover:text-gold-200 hover:bg-white/5 border border-transparent',
  danger: 'text-parchment-50 bg-blood-500/80 border border-blood-400/60 hover:bg-blood-500'
}

export function Button({
  variant = 'secondary',
  icon,
  size = 'md',
  className = '',
  children,
  ...rest
}: Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant
  icon?: string
  size?: 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}) {
  const pad = size === 'lg' ? 'px-7 py-3.5 text-base' : size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5 text-[0.95rem]'
  return (
    <motion.button
      whileHover={rest.disabled ? undefined : { y: -1 }}
      whileTap={rest.disabled ? undefined : { scale: 0.96, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className={`focus-ring no-drag inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg transition-[box-shadow,background-color,border-color,color] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${styles[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} />}
      {children}
    </motion.button>
  )
}
