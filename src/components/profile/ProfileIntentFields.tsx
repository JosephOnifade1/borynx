"use client";

import { useId } from "react";
import { COMPANY_NAME_MAX, MAX_HOURLY_RATE, PROFILE_CURRENCIES, PROFILE_URL_MAX, type ProfilePreferences } from "@/lib/profile-input";

export type ProfileIntentForm = { [Key in keyof ProfilePreferences]: Key extends "lookingToHire" | "availableForWork" ? boolean : string };

export function profileIntentForm(user: ProfilePreferences): ProfileIntentForm {
  return {
    lookingToHire: user.lookingToHire,
    availableForWork: user.availableForWork,
    companyName: user.companyName ?? "",
    companyUrl: user.companyUrl ?? "",
    hourlyRate: user.hourlyRate?.toString() ?? "",
    hourlyCurrency: user.hourlyCurrency ?? "",
  };
}

export function ProfileIntentFields({ value, onChange, errors }: {
  value: ProfileIntentForm;
  onChange: (value: ProfileIntentForm) => void;
  errors?: Record<string, string>;
}) {
  const id = useId();
  const set = <Key extends keyof ProfileIntentForm,>(key: Key, next: ProfileIntentForm[Key]) => onChange({ ...value, [key]: next });
  const inputProps = (field: keyof ProfileIntentForm) => ({
    id: `${id}-${field}`,
    "aria-invalid": errors?.[field] ? true : undefined,
    "aria-describedby": errors?.[field] ? `${id}-${field}-error` : undefined,
  });
  const error = (field: keyof ProfileIntentForm) => errors?.[field]
    ? <p id={`${id}-${field}-error`} className="mt-1 text-[12px] text-danger">{errors[field]}</p>
    : null;

  return (
    <fieldset className="min-w-0 space-y-4 rounded-md border border-line bg-sunken/40 px-3.5 pb-3.5 pt-2">
      <legend className="eyebrow px-1.5">Marketplace profile</legend>
      <p className="text-[12.5px] text-ink-3">Choose either, both, or neither. These settings don&apos;t change what you can post or bid on.</p>
      <div className="space-y-2">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[13.5px] font-semibold">
          <input type="checkbox" className="size-4 accent-[var(--ember)]" checked={value.lookingToHire} onChange={(event) => set("lookingToHire", event.target.checked)} />
          Open to hiring
        </label>
        <p className="text-[12px] text-ink-3">Tell visitors you&apos;re open to hiring. A live public listing shows “Currently hiring” independently of this setting.</p>
        {value.lookingToHire && (
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-companyName`} className="eyebrow mb-1 block">Public company name</label>
              <input {...inputProps("companyName")} type="text" maxLength={COMPANY_NAME_MAX} placeholder="Optional" className="field text-[13px]" value={value.companyName} onChange={(event) => set("companyName", event.target.value)} />
              {error("companyName")}
            </div>
            <div>
              <label htmlFor={`${id}-companyUrl`} className="eyebrow mb-1 block">Company website</label>
              <input {...inputProps("companyUrl")} type="text" inputMode="url" maxLength={PROFILE_URL_MAX} placeholder="https://example.com" className="field text-[13px]" value={value.companyUrl} onChange={(event) => set("companyUrl", event.target.value)} />
              {error("companyUrl")}
            </div>
            <p className="text-[12px] text-ink-3 sm:col-span-2">Company details are optional and appear on your profile only while Open to hiring is on.</p>
          </div>
        )}
      </div>
      <div className="space-y-2 border-t border-line pt-3">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-[13.5px] font-semibold">
          <input type="checkbox" className="size-4 accent-[var(--ember)]" checked={value.availableForWork} onChange={(event) => set("availableForWork", event.target.checked)} />
          Available for work
        </label>
        <p className="text-[12px] text-ink-3">Show your availability and an optional hourly rate.</p>
        {value.availableForWork && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="min-w-0">
              <label htmlFor={`${id}-hourlyRate`} className="eyebrow mb-1 block">Hourly rate</label>
              <input {...inputProps("hourlyRate")} type="number" inputMode="numeric" min={1} max={MAX_HOURLY_RATE} step={1} placeholder="Optional" className="field num text-[13px]" value={value.hourlyRate} onChange={(event) => set("hourlyRate", event.target.value)} />
              {error("hourlyRate")}
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-hourlyCurrency`} className="eyebrow mb-1 block">Currency</label>
              <select {...inputProps("hourlyCurrency")} className="field text-[13px]" value={value.hourlyCurrency} onChange={(event) => set("hourlyCurrency", event.target.value)}>
                <option value="">Choose currency</option>
                {PROFILE_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
              {error("hourlyCurrency")}
            </div>
            <p className="col-span-2 text-[12px] text-ink-3">Leave the amount blank to omit a public rate.</p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
