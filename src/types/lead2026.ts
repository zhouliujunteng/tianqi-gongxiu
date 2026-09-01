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

export interface WenjuanPayEligibilityData {
  fz_payment_record: {
    id: string | number;
    status: string | null;
    type: string | null;
    description: string | null;
  }[];
}

export interface AdvancedCampPreviousPaymentByUserLibraryData {
  fz_payment_record: Array<{
    id: string | number;
    status: string | null;
    description: string | null;
    order: {
      id: string | number;
      ud_dingdanbeizhu_439d3a: string | null;
      ud_dingdanjine_a50087: string | null;
      ud_dingdanjine0028zhengshu0029_1070ec: number | null;
    } | null;
  }>;
}

export interface MyLead2026Item {
  id: string | number;
  created_at: string | null;
  ud_shoujineirong_3bc0b9: Record<string, unknown> | null;
  ud_chubufangan_094122: Record<string, unknown> | null;
}

export interface MyLead2026ListData {
  ud_wenjuanshouji_2026yinliu_cb3e5d: MyLead2026Item[];
}
