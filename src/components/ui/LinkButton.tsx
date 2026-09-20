import { Link, type LinkProps } from 'react-router-dom'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './Button'

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

export function LinkButton({ variant = 'primary', size = 'md', fullWidth = false, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  )
}
