import "server-only";

import { getMasterDataOptions } from "@/lib/master-data/data";
import { createClient } from "@/lib/supabase/server";
import type {
  StudentClassOption,
  StudentDetail,
  StudentListFilters,
  StudentListItem,
  StudentRouteOption,
  StudentValidatedInput,
} from "@/lib/students/types";

type StudentJoinClass = {
  id: string;
  session_label: string;
  class_name: string;
  section: string | null;
  stream_name: string | null;
};

type StudentJoinRoute = {
  id: string;
  route_name: string;
  route_code: string | null;
};

type StudentListRow = {
  id: string;
  admission_no: string;
  full_name: string;
  status: StudentListItem["status"];
  primary_phone: string | null;
  secondary_phone: string | null;
  updated_at: string;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
  route_ref: StudentJoinRoute | StudentJoinRoute[] | null;
};

type StudentDetailRow = {
  id: string;
  admission_no: string;
  full_name: string;
  date_of_birth: string | null;
  father_name: string | null;
  mother_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  address: string | null;
  class_id: string;
  transport_route_id: string | null;
  status: StudentDetail["status"];
  notes: string | null;
  created_at: string;
  updated_at: string;
  class_ref: StudentJoinClass | StudentJoinClass[] | null;
  route_ref: StudentJoinRoute | StudentJoinRoute[] | null;
};

function buildClassLabel(value: {
  class_name: string;
  section: string | null;
  stream_name: string | null;
}) {
  const segments = [value.class_name];

  if (value.section) {
    segments.push(`Section ${value.section}`);
  }

  if (value.stream_name) {
    segments.push(value.stream_name);
  }

  return segments.join(" - ");
}

function toSingleRecord<T>(value: T | T[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function getStudentFormOptions() {
  const options = await getMasterDataOptions();

  const classOptions: StudentClassOption[] = options.classOptions.map((row) => ({
    id: row.id,
    label: row.label,
    sessionLabel: row.sessionLabel,
  }));

  const routeOptions: StudentRouteOption[] = options.routeOptions.map((row) => ({
    id: row.id,
    label: row.label,
    routeCode: row.routeCode,
    isActive: row.isActive,
  }));

  return {
    classOptions,
    routeOptions,
  };
}

export async function getStudents(filters: StudentListFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select(
      "id, admission_no, full_name, status, primary_phone, secondary_phone, updated_at, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
    )
    .order("full_name", { ascending: true });

  if (filters.query) {
    query = query.ilike("full_name", `%${filters.query}%`);
  }

  if (filters.classId) {
    query = query.eq("class_id", filters.classId);
  }

  if (filters.transportRouteId) {
    query = query.eq("transport_route_id", filters.transportRouteId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to load students: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const studentRow = row as StudentListRow;
    const classRef = toSingleRecord(studentRow.class_ref);
    const routeRef = toSingleRecord(studentRow.route_ref);

    return {
      id: studentRow.id,
      admissionNo: studentRow.admission_no,
      fullName: studentRow.full_name,
      status: studentRow.status,
      classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
      transportRouteLabel: routeRef
        ? routeRef.route_code
          ? `${routeRef.route_name} (${routeRef.route_code})`
          : routeRef.route_name
        : "No route",
      fatherPhone: studentRow.primary_phone,
      motherPhone: studentRow.secondary_phone,
      updatedAt: studentRow.updated_at,
    } satisfies StudentListItem;
  });
}

export async function getStudentDetail(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, admission_no, full_name, date_of_birth, father_name, mother_name, primary_phone, secondary_phone, address, class_id, transport_route_id, status, notes, created_at, updated_at, class_ref:classes(id, session_label, class_name, section, stream_name), route_ref:transport_routes(id, route_name, route_code)",
    )
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load student: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as StudentDetailRow;
  const classRef = toSingleRecord(row.class_ref);
  const routeRef = toSingleRecord(row.route_ref);

  return {
    id: row.id,
    admissionNo: row.admission_no,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    fatherName: row.father_name,
    motherName: row.mother_name,
    fatherPhone: row.primary_phone,
    motherPhone: row.secondary_phone,
    address: row.address,
    classId: row.class_id,
    classLabel: classRef ? buildClassLabel(classRef) : "Unknown class",
    transportRouteId: row.transport_route_id,
    transportRouteLabel: routeRef
      ? routeRef.route_code
        ? `${routeRef.route_name} (${routeRef.route_code})`
        : routeRef.route_name
      : "No route",
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies StudentDetail;
}

export async function createStudent(payload: StudentValidatedInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .insert({
      full_name: payload.fullName,
      class_id: payload.classId,
      admission_no: payload.admissionNo,
      date_of_birth: payload.dateOfBirth,
      father_name: payload.fatherName,
      mother_name: payload.motherName,
      primary_phone: payload.fatherPhone,
      secondary_phone: payload.motherPhone,
      address: payload.address,
      transport_route_id: payload.transportRouteId,
      status: payload.status,
      notes: payload.notes,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function updateStudent(studentId: string, payload: StudentValidatedInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update({
      full_name: payload.fullName,
      class_id: payload.classId,
      admission_no: payload.admissionNo,
      date_of_birth: payload.dateOfBirth,
      father_name: payload.fatherName,
      mother_name: payload.motherName,
      primary_phone: payload.fatherPhone,
      secondary_phone: payload.motherPhone,
      address: payload.address,
      transport_route_id: payload.transportRouteId,
      status: payload.status,
      notes: payload.notes,
    })
    .eq("id", studentId)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}
