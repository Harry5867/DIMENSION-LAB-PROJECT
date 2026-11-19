export interface TeamMember {
  slug: string;
  name: string;
  photo?: { src: string; position?: string };
  contact: { email: string; phone: string };
  role: string;
  interests: string;
  responsibilities: readonly string[];
}

export const teamEducation = {
  university: 'Ho Chi Minh City University of Transport',
  major: 'Data Science',
};

export const teamMembers: TeamMember[] = [
  {
    slug: 'nguyen-huu-anh-khoa',
    name: 'Nguyen Huu Anh Khoa',
    photo: { src: '/team/nguyen-huu-anh-khoa-portrait.webp' },
    contact: { email: 'khoanguyen2006pt@gmail.com', phone: '0947243206' },
    role: 'Frontend, Security & Architecture',
    interests: 'Enjoys sports, working out, listening to music, and meeting new people.',
    responsibilities: [
      'Design the frontend interface.',
      'Work on system security.',
      'Define the overall project architecture.',
    ],
  },
  {
    slug: 'nguyen-hai-duy',
    name: 'Nguyen Hai Duy',
    photo: { src: '/team/nguyen-hai-duy-portrait.webp' },
    contact: { email: 'nghaiduy27092006@gmail.com', phone: '0865577721' },
    role: 'System & Feature Specifications',
    interests: 'Enjoys gaming, traveling, and reading stories.',
    responsibilities: [
      'Write detailed system specifications.',
      'Define how individual features should work.',
    ],
  },
  {
    slug: 'tran-thi-thu-hang',
    name: 'Tran Thi Thu Hang',
    photo: { src: '/team/tran-thi-thu-hang-portrait.webp' },
    contact: { email: 'ttthuhang3110@gmail.com', phone: '0382380384' },
    role: 'Quality Assurance',
    interests: 'Enjoys photography, trying new food, and quiet time.',
    responsibilities: [
      'Test system features and verify that they work as intended.',
      'Evaluate the system based on test results.',
    ],
  },
  {
    slug: 'nguyen-xuan-anh-kiet',
    name: 'Nguyen Xuan Anh Kiet',
    photo: { src: '/team/nguyen-xuan-anh-kiet-portrait.webp' },
    contact: { email: 'hary050506@gmail.com', phone: '0375003448' },
    role: 'Presentation & Project Review',
    interests: 'Enjoys working out, creating content, and seeking out new adventures.',
    responsibilities: [
      'Design the presentation slides.',
      'Present the project.',
      'Evaluate the system as a whole.',
    ],
  },
  {
    slug: 'tran-khanh-duyen',
    name: 'Tran Khanh Duyen',
    photo: { src: '/team/tran-khanh-duyen-portrait.webp' },
    contact: { email: 'duyentrankhanh982@gmail.com', phone: '0941914307' },
    role: 'Database & Data Management',
    interests: 'Enjoys spending time with friends, hiking, and listening to music.',
    responsibilities: [
      'Connect the application to the database.',
      'Organize and manage project data.',
    ],
  },
  {
    slug: 'tran-hoang-son',
    name: 'Tran Hoang Son',
    photo: { src: '/team/tran-hoang-son-portrait.webp' },
    contact: { email: 'sont10206@gmail.com', phone: '0932093348' },
    role: 'Backend Development',
    interests: 'Enjoys reading, listening to music, and quiet time.',
    responsibilities: [
      'Set up the backend.',
      'Develop and maintain backend components.',
    ],
  },
];
