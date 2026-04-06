export interface Lead2026FormValues {
  childName: string;
  gender: string;
  age: string;
  grade: string;
  incomeSource: string;
  priorityTwo: string[];
  issueDescription: string;
  dailyPerformance: string;
  parentName: string;
  parentPhone: string;
}

export function emptyLeadForm(): Lead2026FormValues {
  return {
    childName: '',
    gender: '',
    age: '',
    grade: '',
    incomeSource: '',
    priorityTwo: [],
    issueDescription: '',
    dailyPerformance: '',
    parentName: '',
    parentPhone: '',
  };
}

/** 当前登录的默认帐户行 */
export interface MeAccountRow {
  id: string;
  username: string | null;
}

/** 全局文档表中的品牌 logo 查询 */
export interface BrandLogoRow {
  id: string | number;
  ud_tupian_3212f2: { id: string | number; url: string } | null;
}

export interface BrandLogoQueryData {
  ud_quanjuwendang_d0da48: BrandLogoRow[];
}

export interface UserProfileRow {
  id: string | number;
  identity: string | null;
  name: string | null;
  /** 用户库「联系方式 / 手机」 */
  ud_phone_one_dbcfc6: string | null;
}

export interface UserProfileByAccountData {
  ud_yonghuxinxi_89e7ab: UserProfileRow[];
}

export interface Lead2026YinliuListRow {
  id: string | number;
  created_at: string;
  ud_shoujineirong_3bc0b9: Record<string, unknown> | null;
}

export interface ListLeads2026YinliuData {
  ud_wenjuanshouji_2026yinliu_cb3e5d: Lead2026YinliuListRow[];
}
