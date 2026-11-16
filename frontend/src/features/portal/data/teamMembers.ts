type LocalizedText = { en: string; vi: string };

export interface TeamMember {
  slug: string;
  name: string;
  photo?: { src: string; position?: string };
  shortDescription?: LocalizedText;
  role?: LocalizedText;
  bio?: LocalizedText;
  contributions?: LocalizedText[];
  links?: Partial<Record<'GitHub' | 'LinkedIn' | 'Portfolio', string>>;
}

export const teamMembers: TeamMember[] = [
  {
    slug: 'nguyen-huu-anh-khoa',
    name: 'Nguyễn Hữu Anh Khoa',
    photo: { src: '/team/nguyen-huu-anh-khoa.png' },
  },
  {
    slug: 'nguyen-hai-duy',
    name: 'Nguyễn Hải Duy',
    photo: { src: '/team/nguyen-hai-duy.jpeg' },
  },
  {
    slug: 'tran-thi-thu-hang',
    name: 'Trần Thị Thu Hằng',
    photo: { src: '/team/tran-thi-thu-hang.jpeg' },
  },
  {
    slug: 'nguyen-xuan-anh-kiet',
    name: 'Nguyễn Xuân Anh Kiệt',
    photo: { src: '/team/nguyen-xuan-anh-kiet.jpeg' },
  },
  {
    slug: 'tran-khanh-duyen',
    name: 'Trần Khánh Duyên',
    photo: { src: '/team/tran-khanh-duyen.jpeg', position: '50% 95%' },
  },
  {
    slug: 'tran-hoang-son',
    name: 'Trần Hoàng Sơn',
  },
];
