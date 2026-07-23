import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
export const Button=({children,...props}:PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>)=><button {...props}>{children}</button>
