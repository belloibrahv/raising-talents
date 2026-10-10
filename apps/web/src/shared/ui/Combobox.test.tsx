import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Combobox, filterOptions, type ComboboxOption } from './Combobox';

const COUNTRIES: ComboboxOption[] = [
  { value: 'NG', label: 'Nigeria' },
  { value: 'NE', label: 'Niger' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'GB', label: 'United Kingdom', keywords: ['UK', 'England'] },
  { value: 'CI', label: 'Côte d’Ivoire' },
];

function Example() {
  const [value, setValue] = useState('');
  return (
    <Combobox
      label="Country"
      placeholder="Choose your country"
      emptyText="No country matches."
      options={COUNTRIES}
      value={value}
      onChange={setValue}
    />
  );
}

describe('filterOptions', () => {
  it('finds by keyword and ignores case and accents, names that start with the text first', () => {
    expect(filterOptions(COUNTRIES, 'uk').map((option) => option.value)).toEqual(['GB', 'UA']);
    expect(filterOptions(COUNTRIES, 'cote').map((option) => option.value)).toEqual(['CI']);
    expect(filterOptions(COUNTRIES, 'ni').map((option) => option.value)).toEqual([
      'NG',
      'NE',
      'GB',
    ]);
  });
});

describe('Combobox', () => {
  it('narrows as you type and picks with the keyboard', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Example />);
    const field = screen.getByRole('combobox', { name: 'Country' });
    await user.type(field, 'engl');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(field).toHaveValue('United Kingdom');
    expect(field).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the last choice when the text matches nothing and the field is left', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Example />);
    const field = screen.getByRole('combobox', { name: 'Country' });
    await user.type(field, 'nig{ArrowDown}{Enter}');
    expect(field).toHaveValue('Niger');
    await user.clear(field);
    await user.type(field, 'zzz');
    expect(screen.getByText('No country matches.')).toBeVisible();
    await user.tab();
    expect(field).toHaveValue('Niger');
  });
});
