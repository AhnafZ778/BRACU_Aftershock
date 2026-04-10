// Maps Bangladesh locality codes to human-readable area names.
// BD codes follow: BD + [Division 2-digit] + [District 2-digit] + [Upazila 2-digit] + [Union 2-digit]
// Example: BD40870025 → Division 40 (Barisal), District 87 (Patuakhali), Upazila 00, Union 25

// Division codes
const DIVISIONS: Record<string, string> = {
  '10': 'Dhaka',       '20': 'Chittagong',  '30': 'Rajshahi',
  '40': 'Barisal',     '50': 'Khulna',      '55': 'Sylhet',
  '60': 'Rangpur',     '45': 'Mymensingh',
};

// District codes (prefix 2 digits = division, next 2 = district)
const DISTRICTS: Record<string, string> = {
  '1003': 'Dhaka',         '1006': 'Gazipur',       '1015': 'Faridpur',
  '1018': 'Gopalganj',     '1021': 'Kishoreganj',   '1026': 'Madaripur',
  '1029': 'Manikganj',     '1033': 'Munshiganj',    '1036': 'Narayanganj',
  '1039': 'Narsingdi',     '1048': 'Rajbari',       '1054': 'Shariatpur',
  '1056': 'Tangail',
  '2003': 'Chittagong',    '2006': 'Comilla',       '2009': 'Cox\'s Bazar',
  '2012': 'Feni',          '2019': 'Chandpur',      '2022': 'Khagrachhari',
  '2026': 'Lakshmipur',    '2030': 'Noakhali',      '2033': 'Rangamati',
  '2075': 'Brahmanbaria',  '2084': 'Bandarban',
  '3006': 'Bogra',         '3010': 'Chapainawabganj', '3018': 'Joypurhat',
  '3032': 'Naogaon',       '3038': 'Natore',        '3040': 'Nawabganj',
  '3049': 'Pabna',         '3070': 'Rajshahi',      '3076': 'Sirajganj',
  '3081': 'Dinajpur',      '3085': 'Gaibandha',     '3089': 'Kurigram',
  '3094': 'Nilphamari',
  '4006': 'Barguna',       '4009': 'Barisal',       '4018': 'Bhola',
  '4042': 'Jhalokathi',    '4051': 'Patuakhali',    '4078': 'Pirojpur',
  '5000': 'Bagerhat',      '5015': 'Chuadanga',     '5027': 'Jessore',
  '5030': 'Jhenaidah',     '5039': 'Khulna',        '5045': 'Kushtia',
  '5054': 'Magura',        '5057': 'Meherpur',      '5060': 'Narail',
  '5069': 'Satkhira',
  '5591': 'Habiganj',      '5527': 'Moulvibazar',   '5536': 'Sunamganj',
  '5590': 'Sylhet',
  '6012': 'Dinajpur',      '6032': 'Gaibandha',     '6049': 'Kurigram',
  '6058': 'Lalmonirhat',   '6064': 'Nilphamari',    '6073': 'Panchagarh',
  '6076': 'Rangpur',       '6085': 'Thakurgaon',
  '4503': 'Jamalpur',      '4527': 'Mymensingh',    '4540': 'Netrokona',
  '4589': 'Sherpur',
};

/**
 * Converts a BD locality code like "BD40870025" to a human-readable name.
 * Returns: "Patuakhali, Barisal" or "Barisal (Union 25)" depending on resolution.
 */
export function getZoneName(localityCode: string): string {
  if (!localityCode || !localityCode.startsWith('BD')) return localityCode;
  
  const code = localityCode.replace('BD', '');
  const divCode = code.substring(0, 2);
  const distCode = code.substring(0, 4);
  
  const division = DIVISIONS[divCode];
  const district = DISTRICTS[distCode];
  
  if (district && division) {
    return `${district}, ${division}`;
  }
  if (division) {
    return `${division} (${localityCode.slice(-4)})`;
  }
  return localityCode;
}
