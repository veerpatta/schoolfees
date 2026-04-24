import type { StudentStatus } from "@/lib/db/types";

export const STUDENT_STATUSES: ReadonlyArray<{
  value: StudentStatus;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "left", label: "Left" },
  { value: "graduated", label: "Graduated" },
];

export const STUDENT_IMPORT_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  aliases: readonly string[];
}> = [
  {
    key: "full_name",
    label: "Student name",
    aliases: ["student name", "name", "full name"],
  },
  {
    key: "class_id",
    label: "Class",
    aliases: ["class", "class name", "section"],
  },
  {
    key: "admission_no",
    label: "SR no",
    aliases: ["sr no", "sr number", "admission no", "admission number"],
  },
  {
    key: "date_of_birth",
    label: "DOB",
    aliases: ["dob", "date of birth", "birth date"],
  },
  {
    key: "father_name",
    label: "Father name",
    aliases: ["father", "father name"],
  },
  {
    key: "mother_name",
    label: "Mother name",
    aliases: ["mother", "mother name"],
  },
  {
    key: "primary_phone",
    label: "Father phone",
    aliases: ["father phone", "primary phone", "phone 1"],
  },
  {
    key: "secondary_phone",
    label: "Mother phone",
    aliases: ["mother phone", "secondary phone", "phone 2"],
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "location"],
  },
  {
    key: "transport_route_id",
    label: "Transport route",
    aliases: ["transport", "route", "transport route"],
  },
  {
    key: "status",
    label: "Record status",
    aliases: ["status", "record status", "enrollment status"],
  },
  {
    key: "student_type_override",
    label: "Student status",
    aliases: ["student status", "new old", "new/old"],
  },
  {
    key: "custom_tuition_fee_amount",
    label: "Tuition override",
    aliases: ["tuition override", "tuition fee override"],
  },
  {
    key: "custom_transport_fee_amount",
    label: "Transport override",
    aliases: ["transport override", "special transport"],
  },
  {
    key: "discount_amount",
    label: "Discount",
    aliases: ["discount", "discount amount"],
  },
  {
    key: "late_fee_waiver_amount",
    label: "Late fee waiver",
    aliases: ["late fee waiver", "waiver"],
  },
  {
    key: "other_adjustment_head",
    label: "Other fee / adjustment head",
    aliases: ["other head", "other fee head", "adjustment head"],
  },
  {
    key: "other_adjustment_amount",
    label: "Other fee / adjustment amount",
    aliases: ["other amount", "adjustment amount", "other fee amount"],
  },
  {
    key: "notes",
    label: "Notes",
    aliases: ["notes", "remarks", "comment"],
  },
  {
    key: "fee_profile_reason",
    label: "Special-case reason",
    aliases: ["special case reason", "fee profile reason", "override reason"],
  },
];
