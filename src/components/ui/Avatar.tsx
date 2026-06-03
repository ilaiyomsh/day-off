/**
 * Avatar — colored initials bubble for an Employee. Ported from the prototype.
 */
import type { Employee } from '../../domain/types';

export interface AvatarProps {
  emp?: Employee | null;
  size?: string;
}

export function Avatar({ emp, size = 'md' }: AvatarProps) {
  if (!emp) return null;
  return (
    <div className={`avatar ${size}`} style={{ background: emp.color }} title={emp.name}>
      {emp.initials}
    </div>
  );
}
