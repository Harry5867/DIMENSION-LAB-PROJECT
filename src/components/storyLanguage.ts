import type { StoryRecord } from './storyData';
import { localizedCountry } from './WelcomeLanguage';
import type { WelcomeLanguage } from '../utils/welcomePreferences';

const vietnamese: Readonly<Record<string, readonly [country: string, title: string, fields: string]>> = {
  'demo-01': ['VN', 'Đưa dịch vụ y tế đến gần hơn', 'vị trí phòng khám, thời gian di chuyển và phạm vi phục vụ'],
  'demo-02': ['KE', 'Bản đồ chăm sóc sức khỏe', 'vị trí cơ sở y tế, vùng phục vụ và khả năng tiếp cận'],
  'demo-03': ['CA', 'Kết nối các dịch vụ y tế', 'vị trí dịch vụ, tuyến giao thông và quãng đường di chuyển'],
  'demo-04': ['FR', 'Học tập trong thành phố', 'vị trí trường học, khả năng tiếp cận giao thông và đặc điểm khu dân cư'],
  'demo-05': ['IN', 'Những lối đến trường', 'vị trí khuôn viên, khả năng tiếp cận và tiện ích xung quanh'],
  'demo-06': ['AR', 'Bản đồ không gian học tập', 'không gian học tập, hành trình di chuyển và bối cảnh khu dân cư'],
  'demo-07': ['GB', 'Địa lý của hoạt động giao dịch', 'vị trí dịch vụ tài chính, kết nối và khả năng tiếp cận'],
  'demo-08': ['SG', 'Mạng lưới giao dịch', 'vị trí dịch vụ, liên kết mạng lưới và khoảng cách địa lý'],
  'demo-09': ['US', 'Góc nhìn về tiếp cận tài chính', 'phạm vi phục vụ, đặc điểm địa điểm và thời gian di chuyển'],
  'demo-10': ['DE', 'Thành phố của những kết nối', 'vị trí nơi làm việc, tuyến giao thông và đặc điểm không gian'],
  'demo-11': ['MX', 'Nhịp hoạt động hằng ngày', 'địa điểm hoạt động, liên kết di chuyển và mục đích sử dụng đất'],
  'demo-12': ['ID', 'Lần theo kết nối đô thị', 'vị trí nơi làm việc, mô hình di chuyển và khả năng tiếp cận'],
  'demo-13': ['JP', 'Không gian để vận động', 'vị trí sân bãi, khả năng đến công viên và quãng đường di chuyển'],
  'demo-14': ['AU', 'Cảnh quan dành cho vận động', 'sân thể thao, không gian xanh và khả năng tiếp cận'],
  'demo-15': ['BR', 'Thành phố như một sân chơi', 'địa điểm giải trí, lối đi và bối cảnh khu dân cư'],
  'demo-16': ['NZ', 'Đọc cảnh quan xanh', 'vị trí không gian xanh, lớp phủ đất và các kết nối địa phương'],
  'demo-17': ['EG', 'Nơi đô thị gặp cảnh quan', 'lớp phủ đất, không gian mở và bối cảnh địa lý'],
  'demo-18': ['ZA', 'Mạng lưới không gian xanh', 'vị trí công viên, kết nối không gian và khả năng tiếp cận'],
  'demo-19': ['KR', 'Những địa điểm kết nối', 'vị trí mạng lưới, mức kết nối và khoảng cách không gian'],
  'demo-20': ['FI', 'Thành phố kết nối số', 'vị trí dịch vụ, liên kết mạng lưới và khả năng tiếp cận'],
  'demo-21': ['AE', 'Hình dạng của mạng lưới', 'vị trí hạ tầng, các liên kết và đặc điểm địa lý'],
};

export function localizeStory(story: StoryRecord, language: WelcomeLanguage) {
  const translation = language === 'vi' ? vietnamese[story.id] : undefined;
  if (!translation) return story;
  const [iso, title, fields] = translation;
  const city = iso === 'VN' ? 'Hà Nội' : story.city;
  const country = localizedCountry(iso, story.country, language);
  return {
    ...story, title, city, country,
    description: `Câu hỏi minh họa về ${city}. Có thể khảo sát cùng nhau các yếu tố ${fields} như thế nào? Câu chuyện này không sử dụng kết quả đo thực tế.`,
    datasetReference: `Trường dữ liệu ví dụ gồm ${fields}. Chưa có tập dữ liệu đo lường đi kèm.`,
    imageAlt: `Ảnh ${city}, ${country}, minh họa địa điểm trong câu chuyện dữ liệu.`,
    source: { ...story.source, label: 'Minh họa của Dimension Lab' },
    photo: { ...story.photo, changes: 'Ảnh đã đổi kích thước và chuyển sang WebP. Ảnh thu nhỏ được cắt theo khung giao diện.' },
  };
}
