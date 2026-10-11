"use client";

import { useMemo, useState } from "react";

import { FieldInput, FieldSelect } from "@/components/ui/field";

type EmployeeOption = {
  id: string;
  label: string;
  searchText: string;
};

type EmployeeMemberPickerProps = {
  name: string;
  employees: EmployeeOption[];
};

export function EmployeeMemberPicker({ name, employees }: EmployeeMemberPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return employees;
    }
    return employees.filter((employee) => employee.searchText.includes(needle));
  }, [employees, query]);

  return (
    <div className="min-w-0 flex-1 space-y-3" data-employee-member-picker>
      <FieldInput
        label="Filter by name or email"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <FieldSelect
        label="Add employee"
        name={name}
        required
        onChange={(event) => {
          const option = event.currentTarget.selectedOptions[0];
          setSelectedLabel(event.currentTarget.value && option ? option.text : "");
        }}
      >
        <option value="">Select an employee</option>
        {filtered.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.label}
          </option>
        ))}
      </FieldSelect>
      <input type="hidden" name="employeeLabel" value={selectedLabel} />
    </div>
  );
}
