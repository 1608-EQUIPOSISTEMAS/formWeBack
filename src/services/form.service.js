// src/services/comercial.service.js
import {pool} from '../plugins/db.js'
import { callProcedureReturningRows } from '../plugins/spHelper.js'

export async function programList({
  program_version_id = null,
  cat_type_program = null,
  cat_category = null,
  cat_model_modality = null,
  only_active = true,
  q = null,
  page = 1,
  size = 20
} = {}) {

  const rows = await callProcedureReturningRows(
    pool,
    'public.sp_program_list', // <<< nombre del PROCEDURE
    [
      program_version_id,
      cat_type_program,
      cat_category,
      cat_model_modality,
      only_active,
      q,
      page,
      size
    ],
    { statementTimeoutMs: 25000 }
  );
  console.log(rows)
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  const items = rows.map(r => ({
    program_version_id: r.program_version_id,
    program_name: r.program_name,
    commercial_name: r.commercial_name,
    cat_type_program_id: r.cat_type_program_id,
    cat_type_program_alias: r.cat_type_program_alias,
    cat_model_modality_id: r.cat_model_modality_id,
    cat_model_modality_alias: r.cat_model_modality_alias,
    sales_page_url: r.sales_page_url,
    minimun_money_profesional: r.minimun_money_profesional != null ? Number(r.minimun_money_profesional) : null,
    minimun_money_student:    r.minimun_money_student    != null ? Number(r.minimun_money_student)    : null,
    investment_student:       r.investment_student       != null ? Number(r.investment_student)       : null,
    investment_profesional:   r.investment_profesional   != null ? Number(r.investment_profesional)   : null,
    version_code: r.version_code
  }));

  return { total, page: Number(page), size: Number(size), items };
}
