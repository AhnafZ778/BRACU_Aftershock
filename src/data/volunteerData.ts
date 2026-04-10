// Bengali volunteer dummy dataset for the Nirapotta Control Panel.
// These are realistic sample entries for demonstration purposes.

export interface Volunteer {
  id: string;
  name: string;
  phone: string;
  email: string;
  ngoId: string;
  district: string;
  division: string;
  skills: string[];
  status: 'active' | 'standby' | 'deployed';
}

const VOLUNTEER_DATA: Volunteer[] = [
  // Red Crescent Society (ngo-1)
  { id: 'v-101', name: 'আবদুর রহিম', phone: '01712345678', email: 'abdur.rahim@brcs.org', ngoId: 'ngo-1', district: 'Barisal', division: 'Barisal', skills: ['First Aid', 'Rescue'], status: 'active' },
  { id: 'v-102', name: 'ফাতেমা খাতুন', phone: '01812345679', email: 'fatema.khatun@brcs.org', ngoId: 'ngo-1', district: 'Patuakhali', division: 'Barisal', skills: ['Medical', 'Communication'], status: 'deployed' },
  { id: 'v-103', name: 'মোহাম্মদ হাসান', phone: '01912345680', email: 'mohammad.hasan@brcs.org', ngoId: 'ngo-1', district: 'Bhola', division: 'Barisal', skills: ['Boat Operation', 'Rescue'], status: 'active' },
  { id: 'v-104', name: 'নাসরিন আক্তার', phone: '01612345681', email: 'nasrin.akter@brcs.org', ngoId: 'ngo-1', district: 'Barguna', division: 'Barisal', skills: ['First Aid', 'Shelter Mgmt'], status: 'standby' },

  // BRAC (ngo-2)
  { id: 'v-201', name: 'কামরুল ইসলাম', phone: '01712345682', email: 'kamrul.islam@brac.net', ngoId: 'ngo-2', district: 'Khulna', division: 'Khulna', skills: ['Logistics', 'Communication'], status: 'active' },
  { id: 'v-202', name: 'সুমাইয়া বেগম', phone: '01812345683', email: 'sumaiya.begum@brac.net', ngoId: 'ngo-2', district: 'Satkhira', division: 'Khulna', skills: ['Medical', 'First Aid'], status: 'deployed' },
  { id: 'v-203', name: 'রফিকুল ইসলাম', phone: '01912345684', email: 'rafiqul.islam@brac.net', ngoId: 'ngo-2', district: 'Jessore', division: 'Khulna', skills: ['Rescue', 'Boat Operation'], status: 'active' },

  // Care Bangladesh (ngo-3)
  { id: 'v-301', name: 'জাহিদুল হক', phone: '01712345685', email: 'zahidul.haq@care.org', ngoId: 'ngo-3', district: 'Cox\'s Bazar', division: 'Chittagong', skills: ['Logistics', 'Shelter Mgmt'], status: 'active' },
  { id: 'v-302', name: 'রুমানা পারভীন', phone: '01812345686', email: 'rumana.parveen@care.org', ngoId: 'ngo-3', district: 'Noakhali', division: 'Chittagong', skills: ['Communication', 'First Aid'], status: 'standby' },
  { id: 'v-303', name: 'শাহিনুর রহমান', phone: '01912345687', email: 'shahinur.rahman@care.org', ngoId: 'ngo-3', district: 'Feni', division: 'Chittagong', skills: ['Rescue', 'Medical'], status: 'deployed' },

  // ActionAid Bangladesh (ngo-4)
  { id: 'v-401', name: 'মাহমুদুল হাসান', phone: '01712345688', email: 'mahmudul.hasan@actionaid.org', ngoId: 'ngo-4', district: 'Pirojpur', division: 'Barisal', skills: ['First Aid', 'Communication'], status: 'active' },
  { id: 'v-402', name: 'সালমা আক্তার', phone: '01812345689', email: 'salma.akter@actionaid.org', ngoId: 'ngo-4', district: 'Jhalokathi', division: 'Barisal', skills: ['Medical', 'Shelter Mgmt'], status: 'active' },

  // Islamic Relief (ngo-5)
  { id: 'v-501', name: 'তারেক আহমেদ', phone: '01712345690', email: 'tareq.ahmed@islamicrelief.org', ngoId: 'ngo-5', district: 'Lakshmipur', division: 'Chittagong', skills: ['Rescue', 'Logistics'], status: 'deployed' },
  { id: 'v-502', name: 'আয়েশা সিদ্দিকা', phone: '01812345691', email: 'ayesha.siddiqua@islamicrelief.org', ngoId: 'ngo-5', district: 'Chandpur', division: 'Chittagong', skills: ['First Aid', 'Communication'], status: 'active' },

  // World Vision BD (ngo-6)
  { id: 'v-601', name: 'মোস্তফা কামাল', phone: '01712345692', email: 'mostafa.kamal@wvbd.org', ngoId: 'ngo-6', district: 'Bagerhat', division: 'Khulna', skills: ['Boat Operation', 'Rescue'], status: 'active' },
  { id: 'v-602', name: 'নাজমা বেগম', phone: '01812345693', email: 'nazma.begum@wvbd.org', ngoId: 'ngo-6', district: 'Gopalganj', division: 'Dhaka', skills: ['Medical', 'Logistics'], status: 'standby' },

  // Concern Worldwide (ngo-7)
  { id: 'v-701', name: 'হাবিবুর রহমান', phone: '01712345694', email: 'habibur.rahman@concern.net', ngoId: 'ngo-7', district: 'Shariatpur', division: 'Dhaka', skills: ['Communication', 'First Aid'], status: 'deployed' },
  { id: 'v-702', name: 'শাহানারা চৌধুরী', phone: '01812345695', email: 'shahanara.chowdhury@concern.net', ngoId: 'ngo-7', district: 'Madaripur', division: 'Dhaka', skills: ['Rescue', 'Shelter Mgmt'], status: 'active' },
];

export default VOLUNTEER_DATA;
