export type Role = "admin" | "teacher" | "student";
export type AccountStatus = "active" | "inactive" | "on_hold";
export type CourseType = "general_english" | "ielts" | "business_english" | "other";

export type Profile = {
  id: string;
  role: Role;
  status: AccountStatus;
  full_name: string;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type Contact = { user_id: string; email: string; phone: string | null };

export type Course = {
  id: string;
  name: string;
  type: CourseType;
  description: string;
  default_duration_min: number;
  active: boolean;
  sort_order: number;
};

export type TeacherProfile = {
  user_id: string;
  bio: string;
  education: string;
  qualifications: string;
  experience_years: number | null;
  specializations: string[];
  show_on_website: boolean;
};

export type StudentProfile = {
  user_id: string;
  birthday: string | null;
  is_minor: boolean;
  class_level: string;
  enrollment_date: string;
  course_id: string | null;
};

export type Guardian = {
  id: string;
  student_id: string;
  full_name: string;
  relationship: string;
  email: string | null;
  phone: string | null;
  receives_notifications: boolean;
};

export type ActionState = { ok?: boolean; error?: string; message?: string };
