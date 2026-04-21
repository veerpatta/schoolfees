import type { StudentStatus } from "@/lib/db/types";

export type StudentClassOption = {
  id: string;
  label: string;
  sessionLabel: string;
};

export type StudentRouteOption = {
  id: string;
  label: string;
  routeCode: string | null;
  isActive: boolean;
};

export type StudentListFilters = {
  query: string;
  classId: string;
  transportRouteId: string;
  status: "" | StudentStatus;
};

export type StudentListItem = {
  id: string;
  admissionNo: string;
  fullName: string;
  status: StudentStatus;
  classLabel: string;
  transportRouteLabel: string;
  fatherPhone: string | null;
  motherPhone: string | null;
  updatedAt: string;
};

export type StudentDetail = {
  id: string;
  admissionNo: string;
  fullName: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  classId: string;
  classLabel: string;
  transportRouteId: string | null;
  transportRouteLabel: string;
  status: StudentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentFormInput = {
  fullName: string;
  classId: string;
  admissionNo: string;
  dateOfBirth: string;
  fatherName: string;
  motherName: string;
  fatherPhone: string;
  motherPhone: string;
  address: string;
  transportRouteId: string;
  status: string;
  notes: string;
};

export type StudentValidatedInput = {
  fullName: string;
  classId: string;
  admissionNo: string;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  address: string | null;
  transportRouteId: string | null;
  status: StudentStatus;
  notes: string | null;
};

export type StudentFormFieldErrors = Partial<Record<keyof StudentFormInput, string>>;

export type StudentFormActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  fieldErrors: StudentFormFieldErrors;
  studentId: string | null;
};

export const INITIAL_STUDENT_FORM_ACTION_STATE: StudentFormActionState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  studentId: null,
};

export const EMPTY_STUDENT_FILTERS: StudentListFilters = {
  query: "",
  classId: "",
  transportRouteId: "",
  status: "",
};
