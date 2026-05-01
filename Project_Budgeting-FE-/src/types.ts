import React from 'react';

export interface LoginFormData {
  emailOrUsername: string;
  password: string;

  captchaInput: string;
}

export interface FormErrors {
  emailOrUsername?: string;
  password?: string;
  general?: string;
  captcha?: string;
  [key: string]: string | undefined;
}

export type IconProps = React.SVGProps<SVGSVGElement>;

export interface CaptchaProps {
  onCaptchaChange: (token: string) => void;
  refreshCounter?: number;
}



export interface Permission {
  id: number;
  code: string;
  label: string;
  category: string;
}

export interface Role {
  id: number;
  role_name: string;
  description: string;
  is_active: boolean;
  permissions: Permission[];
}

export interface Module {
  id: number;
  product_group: string;
  product_service_name: string;
  description: string;
  is_active: boolean;
}

export interface User {
  id: number | string;
  first_name: string;
  last_name: string;
  email: string;
  position: string;
  module: string | number;
  charges_per_hour: number | null;
  roles: number[];
  languages: string[];
  is_active: boolean;
  profile_picture: string | null;
}

export interface UserDisplay extends Omit<User, 'roles'> {
  roles: (number | { id: number; role_name: string })[];
}
