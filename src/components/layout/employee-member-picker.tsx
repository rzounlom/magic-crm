"use client";

import { useMemo, useState } from "react";

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
    <div className="flex-1 space-y-2">
      <label className="block text-sm">
        <span className="text-foreground/70">Filter by name or email</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground/70">Add employee</span>
        <select
          name={name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
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
        </select>
        <input type="hidden" name="employeeLabel" value={selectedLabel} />
      </label>
    </div>
  );
}
