export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_links: {
        Row: {
          active: boolean
          admin_unit: string | null
          branch: string | null
          cost_center: string | null
          created_at: string
          credit_account: string | null
          current_job: string | null
          debit_account: string | null
          department: string | null
          entitlement_account: string | null
          expense_account: string | null
          id: string
          item_name: string | null
          job_level: string | null
          job_title: string | null
          link_type: string
          main_department: string | null
          notes: string | null
          operation_type: string | null
          path: string | null
          provision_account: string | null
          sector: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          admin_unit?: string | null
          branch?: string | null
          cost_center?: string | null
          created_at?: string
          credit_account?: string | null
          current_job?: string | null
          debit_account?: string | null
          department?: string | null
          entitlement_account?: string | null
          expense_account?: string | null
          id?: string
          item_name?: string | null
          job_level?: string | null
          job_title?: string | null
          link_type?: string
          main_department?: string | null
          notes?: string | null
          operation_type?: string | null
          path?: string | null
          provision_account?: string | null
          sector?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          admin_unit?: string | null
          branch?: string | null
          cost_center?: string | null
          created_at?: string
          credit_account?: string | null
          current_job?: string | null
          debit_account?: string | null
          department?: string | null
          entitlement_account?: string | null
          expense_account?: string | null
          id?: string
          item_name?: string | null
          job_level?: string | null
          job_title?: string | null
          link_type?: string
          main_department?: string | null
          notes?: string | null
          operation_type?: string | null
          path?: string | null
          provision_account?: string | null
          sector?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          target: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          target?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          target?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          section: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          section: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          section?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string | null
          employee_name: string | null
          id: string
          late_minutes: number
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          late_minutes?: number
          status?: string
          updated_at?: string
          work_date?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          late_minutes?: number
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      basic_lookups: {
        Row: {
          active: boolean
          age_from: number | null
          age_to: number | null
          amount: number | null
          category: string
          code: string | null
          created_at: string
          details: string | null
          end_date: string | null
          flag: boolean
          gender: string | null
          grade: number | null
          id: string
          insurance_class: string | null
          insurance_company: string | null
          is_employee: boolean
          is_married: boolean
          job_role: string | null
          kind: string | null
          linked_leaves: string | null
          name_ar: string
          name_en: string | null
          notes: string | null
          notify_days: number | null
          penalty: string | null
          ref_number: string | null
          relation: string | null
          sabb_code: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          age_from?: number | null
          age_to?: number | null
          amount?: number | null
          category: string
          code?: string | null
          created_at?: string
          details?: string | null
          end_date?: string | null
          flag?: boolean
          gender?: string | null
          grade?: number | null
          id?: string
          insurance_class?: string | null
          insurance_company?: string | null
          is_employee?: boolean
          is_married?: boolean
          job_role?: string | null
          kind?: string | null
          linked_leaves?: string | null
          name_ar: string
          name_en?: string | null
          notes?: string | null
          notify_days?: number | null
          penalty?: string | null
          ref_number?: string | null
          relation?: string | null
          sabb_code?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          age_from?: number | null
          age_to?: number | null
          amount?: number | null
          category?: string
          code?: string | null
          created_at?: string
          details?: string | null
          end_date?: string | null
          flag?: boolean
          gender?: string | null
          grade?: number | null
          id?: string
          insurance_class?: string | null
          insurance_company?: string | null
          is_employee?: boolean
          is_married?: boolean
          job_role?: string | null
          kind?: string | null
          linked_leaves?: string | null
          name_ar?: string
          name_en?: string | null
          notes?: string | null
          notify_days?: number | null
          penalty?: string | null
          ref_number?: string | null
          relation?: string | null
          sabb_code?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deductions: {
        Row: {
          active: boolean
          amount: number
          calc_type: string
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          calc_type?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          calc_type?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          branch: string
          created_at: string
          id: string
          manager_name: string | null
          name: string
          updated_at: string
        }
        Insert: {
          branch?: string
          created_at?: string
          id?: string
          manager_name?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          branch?: string
          created_at?: string
          id?: string
          manager_name?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          allowances: number
          bank_name: string | null
          basic_salary: number
          branch: string | null
          contract_end: string | null
          created_at: string
          department: string | null
          email: string | null
          emp_no: string
          full_name: string
          gender: string | null
          hire_date: string | null
          iban: string | null
          id: string
          job_title: string | null
          manager_name: string | null
          national_id: string | null
          nationality: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allowances?: number
          bank_name?: string | null
          basic_salary?: number
          branch?: string | null
          contract_end?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emp_no: string
          full_name: string
          gender?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          job_title?: string | null
          manager_name?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allowances?: number
          bank_name?: string | null
          basic_salary?: number
          branch?: string | null
          contract_end?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emp_no?: string
          full_name?: string
          gender?: string | null
          hire_date?: string | null
          iban?: string | null
          id?: string
          job_title?: string | null
          manager_name?: string | null
          national_id?: string | null
          nationality?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          active: boolean
          amount: number
          calc_type: string
          created_at: string
          gosi_subject: boolean
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          calc_type?: string
          created_at?: string
          gosi_subject?: boolean
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          calc_type?: string
          created_at?: string
          gosi_subject?: boolean
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          active: boolean
          approved_by: string | null
          branch: string | null
          created_at: string
          department: string | null
          email_sent: boolean
          emp_no: string | null
          employee_id: string | null
          employee_name: string | null
          employee_reply: string | null
          entry_date: string
          id: string
          inquiry_date: string
          inquiry_name: string
          inquiry_type: string
          main_department: string | null
          national_id: string | null
          notes: string | null
          path: string | null
          sector: string | null
          source: string
          status: string
          updated_at: string
          user_name: string | null
        }
        Insert: {
          active?: boolean
          approved_by?: string | null
          branch?: string | null
          created_at?: string
          department?: string | null
          email_sent?: boolean
          emp_no?: string | null
          employee_id?: string | null
          employee_name?: string | null
          employee_reply?: string | null
          entry_date?: string
          id?: string
          inquiry_date?: string
          inquiry_name?: string
          inquiry_type?: string
          main_department?: string | null
          national_id?: string | null
          notes?: string | null
          path?: string | null
          sector?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_name?: string | null
        }
        Update: {
          active?: boolean
          approved_by?: string | null
          branch?: string | null
          created_at?: string
          department?: string | null
          email_sent?: boolean
          emp_no?: string | null
          employee_id?: string | null
          employee_name?: string | null
          employee_reply?: string | null
          entry_date?: string
          id?: string
          inquiry_date?: string
          inquiry_name?: string
          inquiry_type?: string
          main_department?: string | null
          national_id?: string | null
          notes?: string | null
          path?: string | null
          sector?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          balance_before: number | null
          created_at: string
          days: number
          employee_id: string | null
          employee_name: string | null
          from_date: string
          id: string
          leave_type: string
          notes: string | null
          status: string
          to_date: string
          updated_at: string
        }
        Insert: {
          balance_before?: number | null
          created_at?: string
          days?: number
          employee_id?: string | null
          employee_name?: string | null
          from_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          status?: string
          to_date?: string
          updated_at?: string
        }
        Update: {
          balance_before?: number | null
          created_at?: string
          days?: number
          employee_id?: string | null
          employee_name?: string | null
          from_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          status?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          account_name: string | null
          allowances: number
          amount: number
          approved_amount: number
          attachment_url: string | null
          basic_salary: number
          branch: string | null
          created_at: string
          deduction_method: string | null
          department: string | null
          emp_no: string | null
          employee_id: string | null
          employee_name: string | null
          entry_date: string | null
          expense_account: string | null
          first_installment_date: string | null
          id: string
          installments: number
          job_title: string | null
          loan_name: string | null
          loan_type: string
          main_department: string | null
          month: number | null
          monthly_amount: number
          national_id: string | null
          nationality: string | null
          notes: string | null
          paid_amount: number
          path: string | null
          posted: boolean
          request_date: string | null
          request_status: string
          sector: string | null
          stage: string | null
          start_date: string | null
          status: string
          total_salary: number
          updated_at: string
          year: number | null
        }
        Insert: {
          account_name?: string | null
          allowances?: number
          amount?: number
          approved_amount?: number
          attachment_url?: string | null
          basic_salary?: number
          branch?: string | null
          created_at?: string
          deduction_method?: string | null
          department?: string | null
          emp_no?: string | null
          employee_id?: string | null
          employee_name?: string | null
          entry_date?: string | null
          expense_account?: string | null
          first_installment_date?: string | null
          id?: string
          installments?: number
          job_title?: string | null
          loan_name?: string | null
          loan_type?: string
          main_department?: string | null
          month?: number | null
          monthly_amount?: number
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          paid_amount?: number
          path?: string | null
          posted?: boolean
          request_date?: string | null
          request_status?: string
          sector?: string | null
          stage?: string | null
          start_date?: string | null
          status?: string
          total_salary?: number
          updated_at?: string
          year?: number | null
        }
        Update: {
          account_name?: string | null
          allowances?: number
          amount?: number
          approved_amount?: number
          attachment_url?: string | null
          basic_salary?: number
          branch?: string | null
          created_at?: string
          deduction_method?: string | null
          department?: string | null
          emp_no?: string | null
          employee_id?: string | null
          employee_name?: string | null
          entry_date?: string | null
          expense_account?: string | null
          first_installment_date?: string | null
          id?: string
          installments?: number
          job_title?: string | null
          loan_name?: string | null
          loan_type?: string
          main_department?: string | null
          month?: number | null
          monthly_amount?: number
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          paid_amount?: number
          path?: string | null
          posted?: boolean
          request_date?: string | null
          request_status?: string
          sector?: string | null
          stage?: string | null
          start_date?: string | null
          status?: string
          total_salary?: number
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          employees_count: number
          id: string
          month: number
          status: string
          title: string
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          employees_count?: number
          id?: string
          month?: number
          status?: string
          title: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
          year?: number
        }
        Update: {
          created_at?: string
          employees_count?: number
          id?: string
          month?: number
          status?: string
          title?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      permission_features: {
        Row: {
          created_at: string
          feature_category: string
          feature_key: string
          feature_name: string
          group_id: string
          id: string
          is_allowed: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_category: string
          feature_key: string
          feature_name: string
          group_id: string
          id?: string
          is_allowed?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_category?: string
          feature_key?: string
          feature_name?: string
          group_id?: string
          id?: string
          is_allowed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_features_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_rules: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_update: boolean
          created_at: string
          group_id: string
          id: string
          is_enabled: boolean
          resource_key: string
          resource_name: string
          resource_section: string
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          group_id: string
          id?: string
          is_enabled?: boolean
          resource_key: string
          resource_name: string
          resource_section?: string
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          group_id?: string
          id?: string
          is_enabled?: boolean
          resource_key?: string
          resource_name?: string
          resource_section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_scopes: {
        Row: {
          created_at: string
          group_id: string
          id: string
          scope_type: string
          scope_value: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          scope_type: string
          scope_value: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          scope_type?: string
          scope_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_scopes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string
          email: string | null
          emp_no: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          national_id: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          email?: string | null
          emp_no?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          national_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          email?: string | null
          emp_no?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          national_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regulation_rules: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          days: number
          id: string
          name: string
          notes: string | null
          updated_at: string
          value_type: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category: string
          created_at?: string
          days?: number
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          value_type?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          days?: number
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          value_type?: string
        }
        Relationships: []
      }
      requests: {
        Row: {
          amount: number | null
          created_at: string
          employee_id: string | null
          employee_name: string | null
          id: string
          notes: string | null
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_shift_groups: {
        Row: {
          active: boolean
          branch: string
          break_minutes: number
          created_at: string
          end_time: string
          grace_minutes: number
          id: string
          name: string
          notes: string | null
          start_time: string
          updated_at: string
          work_days: number
        }
        Insert: {
          active?: boolean
          branch?: string
          break_minutes?: number
          created_at?: string
          end_time?: string
          grace_minutes?: number
          id?: string
          name: string
          notes?: string | null
          start_time?: string
          updated_at?: string
          work_days?: number
        }
        Update: {
          active?: boolean
          branch?: string
          break_minutes?: number
          created_at?: string
          end_time?: string
          grace_minutes?: number
          id?: string
          name?: string
          notes?: string | null
          start_time?: string
          updated_at?: string
          work_days?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_resource: {
        Args: { p_action?: string; p_resource_key: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_permissions_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "employee"],
    },
  },
} as const
