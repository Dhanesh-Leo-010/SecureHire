// SYNTHETIC TEST RECORDS — not real people, not real government data.
import { verhoeffDigit } from '../security.js';

const withCheck = (base11) => base11 + verhoeffDigit(base11);

/** Mock UIDAI registry. Any other Verhoeff-valid number succeeds with no demographic data. */
export const AADHAAR_REGISTRY = {
  [withCheck('23456789012')]: { name: 'Priya Raman', dob: '2000-04-12', gender: 'F', state: 'Tamil Nadu' },
  [withCheck('34567890123')]: { name: 'Arjun Kumar', dob: '2003-09-02', gender: 'M', state: 'Karnataka' },
  [withCheck('45678901234')]: { name: 'Rahul Sharma', dob: '1998-01-23', gender: 'M', state: 'Maharashtra' },
  [withCheck('56789012345')]: { name: 'Meera Nair', dob: '1999-11-30', gender: 'F', state: 'Kerala' },
  [withCheck('67890123456')]: { name: 'Vikram Iyer', dob: '1997-06-15', gender: 'M', state: 'Tamil Nadu' },
};
export const DEMO_AADHAAR = Object.keys(AADHAAR_REGISTRY);
/** Numbers that simulate provider outcomes for testing the interface. */
export const AADHAAR_TEST_TRIGGERS = {
  unavailable: withCheck('99990000001'),
  pending: withCheck('99990000002'),
};
export const MOCK_AADHAAR_OTP = '123456';

/** Mock APAAR / academic registry (keyed by APAAR ID). */
export const APAAR_REGISTRY = {
  '100000000001': { name: 'Priya Raman', degree: 'Bachelor of Technology in Computer Science and Engineering', institution: 'College of Engineering Guindy, Anna University', enrollmentYear: 2018, graduationYear: 2022, grade: 'CGPA 8.7', certificateId: 'AU-2022-CSE-01842' },
  '100000000002': { name: 'Arjun Kumar', degree: 'Bachelor of Technology in Artificial Intelligence and Data Science', institution: 'PSG College of Technology', enrollmentYear: 2022, graduationYear: 2026, grade: 'CGPA 7.9 (in progress)', certificateId: 'PSG-2026-AIDS-00317' },
  '100000000003': { name: 'Rahul Sharma', degree: 'Bachelor of Engineering in Information Technology', institution: 'Pune Institute of Computer Technology', enrollmentYear: 2015, graduationYear: 2019, grade: 'CGPA 7.4', certificateId: 'SPPU-2019-IT-11290' },
  '100000000004': { name: 'Meera Nair', degree: 'Master of Computer Applications', institution: 'Cochin University of Science and Technology', enrollmentYear: 2020, graduationYear: 2022, grade: 'CGPA 8.9', certificateId: 'CUSAT-2022-MCA-00412' },
  '100000000010': { name: '(Demo record)', degree: 'Bachelor of Engineering in Electronics and Communication Engineering', institution: 'PSG College of Technology', enrollmentYear: 2019, graduationYear: 2023, grade: 'CGPA 8.1', certificateId: 'PSG-2023-ECE-00999' },
  '100000000011': { name: '(Demo record)', degree: 'Bachelor of Technology in Information Technology', institution: 'Vellore Institute of Technology', enrollmentYear: 2020, graduationYear: 2024, grade: 'CGPA 8.4', certificateId: 'VIT-2024-IT-02231' },
};

/** Mock employer confirmations (employer → people the employer can confirm). */
export const EMPLOYMENT_REGISTRY = [
  { employer: 'Zoho Corporation', name: 'Priya Raman', title: 'Software Engineer', start: '2022-07', end: '2024-05' },
  { employer: 'Freshworks', name: 'Priya Raman', title: 'Senior Software Engineer', start: '2024-06', end: null },
  { employer: 'Infosys', name: 'Rahul Sharma', title: 'Systems Engineer', start: '2019-08', end: '2021-12' },
  { employer: 'TCS', name: 'Meera Nair', title: 'Associate Consultant', start: '2022-08', end: null },
  { employer: 'Infosys', name: 'Arjun Kumar', title: 'Intern', start: '2024-05', end: '2024-07' },
];
