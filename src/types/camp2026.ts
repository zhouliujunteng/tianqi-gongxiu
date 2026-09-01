export interface MiniProgramUserIdentityRow {
  id: string | number;
  identity: string | null;
  ud_id002fchaxun_fb7c4b?: string | null;
}

export interface MiniProgramUserIdentityQueryData {
  ud_yonghuxinxi_89e7ab: MiniProgramUserIdentityRow[];
}

export interface CampPublicStudentRow {
  id: string | number;
  ud_id_4c38d0: string | null;
}

export interface CampIdMatchesQueryData {
  ud_yonghuxinxi_89e7ab: MiniProgramUserIdentityRow[];
  ud_gongzhonghaoxueyuanbaimingdan_9a7b8b: CampPublicStudentRow[];
}

export interface CampServiceQrQueryData {
  ud_quanjuwendang_d0da48: Array<{
    id: string | number;
    updated_at: string | null;
    ud_tupian_3212f2: {
      id: string | number;
      url: string;
    } | null;
  }>;
}

export interface CampGlobalDocImagesQueryData {
  ud_quanjuwendang_d0da48: Array<{
    id: string | number;
    updated_at: string | null;
    ud_leixing_95f511: string | null;
    ud_tupian_3212f2: {
      id: string | number;
      url: string;
    } | null;
  }>;
}

export interface CampCheckinRow {
  id: string | number;
  created_at: string | null;
  ud_daqiatupian_764935?: {
    id: string | number;
    url: string;
  } | null;
}

export interface CampEnrollmentStatusData {
  fz_payment_record: Array<{
    id: string | number;
    order_id: string | number | null;
    created_at: string | null;
    description: string | null;
    status: string | null;
    order: {
      id: string | number;
      ud_dingdanleixing_3fb8b8: string | null;
      ud_dingdanbeizhu_439d3a?: string | null;
      ud_gongzhonghaoid_665d9b?: string | null;
      ud_gongxiuyingweixin_62acc6?: string | null;
      ud_tianjiazhuangtai_a1779b?: string | null;
      ud_gongxiuyingdaqiajilu_fd4f79: CampCheckinRow[];
      ud_gongxiuyingdaqiajilu_fd4f79_aggregate: {
        aggregate: {
          count: number | null;
        } | null;
      } | null;
    } | null;
  }>;
}

export interface CampAdminPaidUsersData {
  fz_payment_record: Array<{
    id: string | number;
    account_id: string | number | null;
    created_at: string | null;
    order_id: string | number | null;
    order: {
      id: string | number;
      ud_dingdanleixing_3fb8b8: string | null;
      ud_dingdanbeizhu_439d3a: string | null;
      ud_yonghuxinxi_yonghuku_55773d?: string | number | null;
      ud_gongzhonghaoid_665d9b?: string | null;
      ud_gongxiuyingweixin_62acc6?: string | null;
      ud_tianjiazhuangtai_a1779b?: string | null;
      ud_dingdanjine_a50087: string | null;
      ud_dingdanjine0028zhengshu0029_1070ec: number | null;
      ud_gongxiuyingdaqiajilu_fd4f79_aggregate: {
        aggregate: {
          count: number | null;
        } | null;
      } | null;
      ud_gongxiuyingdaqiajilu_fd4f79: Array<{
        id: string | number;
        created_at: string | null;
        ud_daqiatupian_764935?: {
          id: string | number;
          url: string;
        } | null;
      }>;
    } | null;
  }>;
}

export interface CampAdminUserLibraryIdsData {
  ud_yonghuxinxi_89e7ab: Array<{
    id: string | number;
    ud_id002fchaxun_fb7c4b: string | null;
  }>;
}

export interface GetImageUploadUrlData {
  imagePresignedUrl: {
    imageId: string | number;
    uploadUrl: string;
    uploadHeaders: Record<string, string> | null;
  };
}

