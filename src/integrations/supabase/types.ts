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
      admin_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      android_devices: {
        Row: {
          archived_at: string | null
          battery_level: number | null
          consecutive_failures: number
          created_at: string
          delivery_block_reason: string | null
          delivery_blocked_at: string | null
          device_id: string
          device_name: string
          failed_deliveries: number | null
          id: string
          is_active: boolean
          is_charging: boolean | null
          is_primary_hormuud_sim: boolean
          last_ping_at: string | null
          provider_name: string
          sim_number: string
          sim1_enabled: boolean
          sim1_priority: number
          sim1_provider: string | null
          sim2_enabled: boolean
          sim2_number: string | null
          sim2_priority: number
          sim2_provider: string | null
          tenant_id: string
          total_deliveries: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          battery_level?: number | null
          consecutive_failures?: number
          created_at?: string
          delivery_block_reason?: string | null
          delivery_blocked_at?: string | null
          device_id: string
          device_name: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          is_primary_hormuud_sim?: boolean
          last_ping_at?: string | null
          provider_name: string
          sim_number: string
          sim1_enabled?: boolean
          sim1_priority?: number
          sim1_provider?: string | null
          sim2_enabled?: boolean
          sim2_number?: string | null
          sim2_priority?: number
          sim2_provider?: string | null
          tenant_id: string
          total_deliveries?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          battery_level?: number | null
          consecutive_failures?: number
          created_at?: string
          delivery_block_reason?: string | null
          delivery_blocked_at?: string | null
          device_id?: string
          device_name?: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          is_primary_hormuud_sim?: boolean
          last_ping_at?: string | null
          provider_name?: string
          sim_number?: string
          sim1_enabled?: boolean
          sim1_priority?: number
          sim1_provider?: string | null
          sim2_enabled?: boolean
          sim2_number?: string | null
          sim2_priority?: number
          sim2_provider?: string | null
          tenant_id?: string
          total_deliveries?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "android_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          description: string
          id: string
          setting_key: string
          setting_value: boolean | null
          tenant_id: string
          text_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          setting_key: string
          setting_value?: boolean | null
          tenant_id: string
          text_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          setting_key?: string
          setting_value?: boolean | null
          tenant_id?: string
          text_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_delivery_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_numbers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_packages: {
        Row: {
          cost_price: number
          created_at: string
          data_amount: string
          id: string
          is_active: boolean
          package_name: string
          provider_name: string
          selling_price: number
          sim_password: string | null
          tenant_id: string
          topup_number_id: string
          ussd_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name: string
          provider_name?: string
          selling_price: number
          sim_password?: string | null
          tenant_id: string
          topup_number_id: string
          ussd_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name?: string
          provider_name?: string
          selling_price?: number
          sim_password?: string | null
          tenant_id?: string
          topup_number_id?: string
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_packages_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_phone_mappings: {
        Row: {
          category_name: string | null
          created_at: string
          custom_amount: string | null
          id: string
          is_active: boolean
          label: string | null
          package_id: string | null
          phone_number: string
          tenant_id: string
          topup_number_id: string
        }
        Insert: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number: string
          tenant_id: string
          topup_number_id: string
        }
        Update: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number?: string
          tenant_id?: string
          topup_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_phone_mappings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_phone_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_phone_mappings_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          password_hash: string
          tenant_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash: string
          tenant_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash?: string
          tenant_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_sessions: {
        Row: {
          created_at: string
          credential_id: string
          expires_at: string
          id: string
          last_used_at: string | null
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          tenant_id: string
          token: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_sessions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "bank_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          acc_no: string | null
          charge_amt: number | null
          created_at: string
          currency_code: string | null
          customer_name: string | null
          dr_cr: string | null
          id: string
          match_notes: string | null
          match_status: string
          matched_order_id: string | null
          matched_payment_id: string | null
          narration: string | null
          parsed_receiver_phone: string | null
          parsed_sender_phone: string | null
          processed_at: string | null
          raw_payload: Json | null
          rrp_no: string | null
          tenant_id: string
          tran_amt: number
          tran_date: string | null
          tran_date_time: string | null
          tran_desc: string | null
          tran_no: string
          tran_type: string | null
          user_id_field: string | null
          uti: string | null
        }
        Insert: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tenant_id: string
          tran_amt: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Update: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tenant_id?: string
          tran_amt?: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no?: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      banners_config: {
        Row: {
          alt_text: string | null
          banner_image: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          media_type: string | null
          rotation_interval: number | null
          tenant_id: string
          updated_at: string
          video_duration: number | null
        }
        Insert: {
          alt_text?: string | null
          banner_image: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          tenant_id: string
          updated_at?: string
          video_duration?: number | null
        }
        Update: {
          alt_text?: string | null
          banner_image?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          tenant_id?: string
          updated_at?: string
          video_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
          tenant_id: string
          unblocked_at: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
          tenant_id: string
          unblocked_at?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
          tenant_id?: string
          unblocked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sms_campaigns: {
        Row: {
          created_at: string
          device_id: string | null
          failed_count: number
          id: string
          message: string
          sent_count: number
          sim_slot: number | null
          status: string
          target_type: string
          tenant_id: string
          total_recipients: number
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          tenant_id: string
          total_recipients?: number
        }
        Update: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message?: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          tenant_id?: string
          total_recipients?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_sms_queue: {
        Row: {
          campaign_id: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sim_slot: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_sms_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_discounts: {
        Row: {
          applicable_to: string | null
          created_at: string
          customer_phone: string
          discount_type: string | null
          discount_value: number
          id: string
          is_active: boolean
          notes: string | null
          package_id: string | null
          provider_id: string | null
          tenant_id: string
        }
        Insert: {
          applicable_to?: string | null
          created_at?: string
          customer_phone: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id: string
        }
        Update: {
          applicable_to?: string | null
          created_at?: string
          customer_phone?: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_discounts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_packages_config: {
        Row: {
          category_id: string | null
          connection_type_label: string
          cost_price: number
          created_at: string
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          is_discovery_root: boolean
          is_ussd_only: boolean
          package_name: string
          profit_margin: number | null
          provider_id: string
          secret_prices: number[]
          selling_price: number
          somlink_bundle_id: number | null
          tenant_id: string
          updated_at: string
          ussd_code: string | null
          validity_days: string
        }
        Insert: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_discovery_root?: boolean
          is_ussd_only?: boolean
          package_name: string
          profit_margin?: number | null
          provider_id: string
          secret_prices?: number[]
          selling_price: number
          somlink_bundle_id?: number | null
          tenant_id: string
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
        }
        Update: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_discovery_root?: boolean
          is_ussd_only?: boolean
          package_name?: string
          profit_margin?: number | null
          provider_id?: string
          secret_prices?: number[]
          selling_price?: number
          somlink_bundle_id?: number | null
          tenant_id?: string
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_packages_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_instructions: {
        Row: {
          category_id: string | null
          code_template: string | null
          created_at: string
          execution_order: number | null
          id: string
          instruction_template: string | null
          instruction_type: string
          notes: string | null
          order_id: string | null
          package_id: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string | null
          sim_password: string | null
          status: string | null
          tenant_id: string
          ussd_code: string | null
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          tenant_id: string
          ussd_code?: string | null
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          tenant_id?: string
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queue: {
        Row: {
          android_device_id: string | null
          attempts: number | null
          completed_at: string | null
          created_at: string
          discovery_menu_label: string | null
          dispatch_device_id: string | null
          dispatched_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          order_id: string
          package_code: string | null
          provider_name: string
          provider_response: string | null
          receiver_phone: string
          scheduled_at: string | null
          sim_password: string | null
          sim_slot: number | null
          somlink_response: Json | null
          status: string | null
          tenant_id: string
          ussd_code: string
        }
        Insert: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          discovery_menu_label?: string | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          order_id: string
          package_code?: string | null
          provider_name: string
          provider_response?: string | null
          receiver_phone: string
          scheduled_at?: string | null
          sim_password?: string | null
          sim_slot?: number | null
          somlink_response?: Json | null
          status?: string | null
          tenant_id: string
          ussd_code: string
        }
        Update: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          discovery_menu_label?: string | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          order_id?: string
          package_code?: string | null
          provider_name?: string
          provider_response?: string | null
          receiver_phone?: string
          scheduled_at?: string | null
          sim_password?: string | null
          sim_slot?: number | null
          somlink_response?: Json | null
          status?: string | null
          tenant_id?: string
          ussd_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          is_acknowledged: boolean | null
          is_resolved: boolean | null
          last_sms_at: string | null
          message: string | null
          resolved_at: string | null
          sms_count: number | null
          tenant_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_resolved?: boolean | null
          last_sms_at?: string | null
          message?: string | null
          resolved_at?: string | null
          sms_count?: number | null
          tenant_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_resolved?: boolean | null
          last_sms_at?: string | null
          message?: string | null
          resolved_at?: string | null
          sms_count?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_unmatched_labels: {
        Row: {
          created_at: string
          hits: number
          id: string
          last_seen_at: string
          normalized_label: string
          raw_label: string
          root_package_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          normalized_label: string
          raw_label: string
          root_package_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          normalized_label?: string
          raw_label?: string
          root_package_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_unmatched_labels_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_unmatched_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      error_messages: {
        Row: {
          created_at: string
          error_code: string
          error_type: string | null
          icon_type: string | null
          icon_value: string | null
          id: string
          is_active: boolean
          is_animated: boolean | null
          message: string | null
          message_en: string | null
          message_so: string | null
          tenant_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          error_code: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          tenant_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_packages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          package_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "featured_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          amount: number
          created_at: string
          description: string | null
          id: string
          is_reviewed: boolean
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_phone: string
          severity: string
          tenant_id: string
        }
        Insert: {
          alert_type: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone: string
          severity?: string
          tenant_id: string
        }
        Update: {
          alert_type?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iftin_partner_credentials: {
        Row: {
          api_key: string
          callback_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          callback_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          callback_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iftin_partner_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message: string
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_registrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          package_id: string | null
          package_name: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string
          sender_phone: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          package_id?: string | null
          package_name?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone: string
          sender_phone: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          package_id?: string | null
          package_name?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string
          sender_phone?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          callback_url: string | null
          cost_price: number
          created_at: string
          customer_phone: string
          data_amount: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          discovery_id: string | null
          discovery_menu_label: string | null
          discovery_root_id: string | null
          external_ref: string | null
          id: string
          invoice_url: string | null
          is_manual: boolean | null
          package_id: string | null
          package_name: string
          payment_number: string | null
          payment_provider_id: string | null
          payment_source: string | null
          provider_id: string | null
          receiver_phone: string
          selling_price: number
          sender_phone: string | null
          source: string
          status: string
          tenant_id: string
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          callback_url?: string | null
          cost_price?: number
          created_at?: string
          customer_phone: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          discovery_id?: string | null
          discovery_menu_label?: string | null
          discovery_root_id?: string | null
          external_ref?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone: string
          selling_price: number
          sender_phone?: string | null
          source?: string
          status?: string
          tenant_id: string
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          callback_url?: string | null
          cost_price?: number
          created_at?: string
          customer_phone?: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          discovery_id?: string | null
          discovery_menu_label?: string | null
          discovery_root_id?: string | null
          external_ref?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          package_id?: string | null
          package_name?: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone?: string
          selling_price?: number
          sender_phone?: string | null
          source?: string
          status?: string
          tenant_id?: string
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_discovery_id_fkey"
            columns: ["discovery_id"]
            isOneToOne: false
            referencedRelation: "ussd_package_discoveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_categories: {
        Row: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_image?: string | null
          category_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_image?: string | null
          category_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoices: {
        Row: {
          created_at: string
          id: string
          invoice_date: string
          notes: string | null
          orders_count: number
          paid_at: string | null
          status: string
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_date: string
          notes?: string | null
          orders_count?: number
          paid_at?: string | null
          status?: string
          tenant_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_date?: string
          notes?: string | null
          orders_count?: number
          paid_at?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_orders_ledger: {
        Row: {
          amount: number
          billable: number
          created_at: string
          external_ref: string
          id: string
          invoice_id: string | null
          order_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billable?: number
          created_at?: string
          external_ref: string
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billable?: number
          created_at?: string
          external_ref?: string
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_orders_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_orders_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers_config: {
        Row: {
          commission_rate: number
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_waafipay: boolean
          payment_number: string | null
          prefix_code: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string
          updated_at: string
          ussd_code_template: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_waafipay?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name: string
          tenant_id: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_waafipay?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name?: string
          tenant_id?: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_providers_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          matched_order_id: string | null
          matching_strategy: string | null
          processed_at: string | null
          receiver_sim: string | null
          sender_phone: string
          sms_body: string | null
          status: string | null
          tenant_id: string
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone: string
          sms_body?: string | null
          status?: string | null
          tenant_id: string
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone?: string
          sms_body?: string | null
          status?: string | null
          tenant_id?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_online_payments: {
        Row: {
          created_at: string
          discovery_id: string | null
          discovery_index: string | null
          discovery_label: string | null
          expected_amount: number
          id: string
          matched_at: string | null
          package_id: string | null
          payment_provider: string | null
          provider_id: string | null
          receiver_phone: string
          sender_phone: string
          status: string
          tenant_id: string
          verified_phone: string | null
        }
        Insert: {
          created_at?: string
          discovery_id?: string | null
          discovery_index?: string | null
          discovery_label?: string | null
          expected_amount: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone: string
          sender_phone: string
          status?: string
          tenant_id: string
          verified_phone?: string | null
        }
        Update: {
          created_at?: string
          discovery_id?: string | null
          discovery_index?: string | null
          discovery_label?: string | null
          expected_amount?: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone?: string
          sender_phone?: string
          status?: string
          tenant_id?: string
          verified_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_online_payments_discovery_id_fkey"
            columns: ["discovery_id"]
            isOneToOne: false
            referencedRelation: "ussd_package_discoveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_apps: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          file_url: string
          icon_url: string | null
          id: string
          is_active: boolean
          name: string
          platform: string
          tenant_id: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          file_url: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          platform?: string
          tenant_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          file_url?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          platform?: string
          tenant_id?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_apps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      providers_config: {
        Row: {
          created_at: string
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_overrides: {
        Row: {
          base_price: number | null
          created_at: string
          id: string
          kind: string
          payment_number: string | null
          ref_id: string
          sell_price: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string
          id?: string
          kind: string
          payment_number?: string | null
          ref_id: string
          sell_price?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          created_at?: string
          id?: string
          kind?: string
          payment_number?: string | null
          ref_id?: string
          sell_price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_balances: {
        Row: {
          balance: number
          balance_source: string
          balance_type: string
          created_at: string
          device_id: string
          id: string
          last_updated: string
          sim_id: string | null
          sim_slot: number
          tenant_id: string
        }
        Insert: {
          balance?: number
          balance_source?: string
          balance_type?: string
          created_at?: string
          device_id: string
          id?: string
          last_updated?: string
          sim_id?: string | null
          sim_slot?: number
          tenant_id: string
        }
        Update: {
          balance?: number
          balance_source?: string
          balance_type?: string
          created_at?: string
          device_id?: string
          id?: string
          last_updated?: string
          sim_id?: string | null
          sim_slot?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_pins: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          pin: string
          provider_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          pin?: string
          provider_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          pin?: string
          provider_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          amount: number | null
          counterpart_phone: string | null
          created_at: string
          device_id: string
          id: string
          received_at: string
          sim_number: string | null
          sim_slot: number
          sms_body: string
          sms_sender: string | null
          sms_type: string
          tenant_id: string
          tx_id: string | null
          tx_type: string | null
        }
        Insert: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body: string
          sms_sender?: string | null
          sms_type?: string
          tenant_id: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Update: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id?: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body?: string
          sms_sender?: string | null
          sms_type?: string
          tenant_id?: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          display_order: number
          features: Json
          id: string
          is_active: boolean
          max_admins: number
          max_devices: number
          max_orders_monthly: number
          name: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_admins?: number
          max_devices?: number
          max_orders_monthly?: number
          name: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_admins?: number
          max_devices?: number
          max_orders_monthly?: number
          name?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_push_config: {
        Row: {
          created_at: string
          enabled: boolean
          onesignal_app_id: string
          rest_api_key_secret_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          onesignal_app_id: string
          rest_api_key_secret_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          onesignal_app_id?: string
          rest_api_key_secret_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_push_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          plan_id: string | null
          recorded_by: string | null
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          plan_id?: string | null
          recorded_by?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          plan_id?: string | null
          recorded_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          apk_updated_at: string | null
          apk_url: string | null
          apk_version: string | null
          balance_due: number
          created_at: string
          credit_limit: number
          current_period_end: string | null
          daily_limit: number
          delivery_mode: string
          delivery_tenant_id: string | null
          demo_reset_at: string | null
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          notes: string | null
          owner_user_id: string | null
          plan_id: string | null
          primary_color: string | null
          slug: string
          status: string
          support_phone: string | null
          suspended_at: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          apk_updated_at?: string | null
          apk_url?: string | null
          apk_version?: string | null
          balance_due?: number
          created_at?: string
          credit_limit?: number
          current_period_end?: string | null
          daily_limit?: number
          delivery_mode?: string
          delivery_tenant_id?: string | null
          demo_reset_at?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          primary_color?: string | null
          slug: string
          status?: string
          support_phone?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          apk_updated_at?: string | null
          apk_url?: string | null
          apk_version?: string | null
          balance_due?: number
          created_at?: string
          credit_limit?: number
          current_period_end?: string | null
          daily_limit?: number
          delivery_mode?: string
          delivery_tenant_id?: string | null
          demo_reset_at?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          plan_id?: string | null
          primary_color?: string | null
          slug?: string
          status?: string
          support_phone?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_delivery_tenant_id_fkey"
            columns: ["delivery_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
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
          role?: Database["public"]["Enums"]["app_role"]
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
      ussd_package_discoveries: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          device_id: string | null
          error: string | null
          expires_at: string | null
          id: string
          items: Json
          phone_number: string
          queued_at: string
          raw_menu: string | null
          root_package_id: string
          selected_index: string | null
          selected_label: string | null
          selected_order_id: string | null
          session_device_id: string | null
          session_expires_at: string | null
          session_note: string | null
          session_state: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          items?: Json
          phone_number: string
          queued_at?: string
          raw_menu?: string | null
          root_package_id: string
          selected_index?: string | null
          selected_label?: string | null
          selected_order_id?: string | null
          session_device_id?: string | null
          session_expires_at?: string | null
          session_note?: string | null
          session_state?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          items?: Json
          phone_number?: string
          queued_at?: string
          raw_menu?: string | null
          root_package_id?: string
          selected_index?: string | null
          selected_label?: string | null
          selected_order_id?: string | null
          session_device_id?: string | null
          session_expires_at?: string | null
          session_note?: string | null
          session_state?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_package_discoveries_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ussd_package_discoveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ussd_price_catalog: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          info_line1: string | null
          info_line2: string | null
          is_active: boolean
          label: string
          normalized_label: string
          root_package_id: string
          selling_price: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          info_line1?: string | null
          info_line2?: string | null
          is_active?: boolean
          label: string
          normalized_label?: string
          root_package_id: string
          selling_price?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          info_line1?: string | null
          info_line2?: string | null
          is_active?: boolean
          label?: string
          normalized_label?: string
          root_package_id?: string
          selling_price?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_price_catalog_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ussd_price_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_phones: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          phone_number: string
          tenant_id: string
          verification_code: string | null
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number: string
          tenant_id: string
          verification_code?: string | null
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number?: string
          tenant_id?: string
          verification_code?: string | null
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_phones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waafipay_transactions: {
        Row: {
          amount: number
          approved_at: string | null
          client_reference: string
          created_at: string
          currency: string
          environment: string
          error_message: string | null
          id: string
          issuer_transaction_id: string | null
          order_id: string | null
          package_id: string
          payer_phone: string
          payment_provider_id: string | null
          raw_response: Json | null
          receiver_phone: string
          reference_id: string
          request_id: string
          response_code: string | null
          response_message: string | null
          status: string
          tenant_id: string
          updated_at: string
          waafi_state: string | null
          waafi_transaction_id: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          client_reference: string
          created_at?: string
          currency?: string
          environment: string
          error_message?: string | null
          id?: string
          issuer_transaction_id?: string | null
          order_id?: string | null
          package_id: string
          payer_phone: string
          payment_provider_id?: string | null
          raw_response?: Json | null
          receiver_phone: string
          reference_id: string
          request_id: string
          response_code?: string | null
          response_message?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          waafi_state?: string | null
          waafi_transaction_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          client_reference?: string
          created_at?: string
          currency?: string
          environment?: string
          error_message?: string | null
          id?: string
          issuer_transaction_id?: string | null
          order_id?: string | null
          package_id?: string
          payer_phone?: string
          payment_provider_id?: string | null
          raw_response?: Json | null
          receiver_phone?: string
          reference_id?: string
          request_id?: string
          response_code?: string | null
          response_message?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          waafi_state?: string | null
          waafi_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waafipay_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waafipay_transactions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waafipay_transactions_payment_provider_id_fkey"
            columns: ["payment_provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waafipay_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_tenant_balance: {
        Args: { _delta: number; _tenant_id: string }
        Returns: number
      }
      apply_master_template_to_tenant: {
        Args: { p_template_key: string; p_tenant_id: string }
        Returns: Json
      }
      authorized_tenant_id: { Args: never; Returns: string }
      claim_discovery_selection: {
        Args: { p_device_id: string }
        Returns: Json
      }
      claim_next_delivery: {
        Args: { p_device_id: string; p_providers: string[] }
        Returns: Json
      }
      claim_next_discovery: { Args: { p_device_id: string }; Returns: Json }
      complete_discovery: {
        Args: {
          p_device_id: string
          p_error?: string
          p_hold?: boolean
          p_id: string
          p_items?: Json
          p_raw_menu: string
        }
        Returns: Json
      }
      complete_discovery_selection: {
        Args: {
          p_device_id: string
          p_id: string
          p_response?: string
          p_success: boolean
        }
        Returns: Json
      }
      current_request_tenant_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      demo_reset_if_stale: { Args: { p_tenant_id: string }; Returns: Json }
      demo_reset_now: { Args: { p_tenant_id: string }; Returns: Json }
      demo_reset_tenant: {
        Args: { p_actor?: string; p_tenant_id: string }
        Returns: Json
      }
      discovery_delivery_fallback: {
        Args: { p_discovery_id: string }
        Returns: undefined
      }
      discovery_has_waiting_request: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      discovery_session_lost: {
        Args: { p_device_id: string; p_id: string }
        Returns: Json
      }
      effective_tenant_id: { Args: never; Returns: string }
      enqueue_discovery_selection:
        | {
            Args: {
              p_discovery_id: string
              p_label: string
              p_order_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_discovery_id: string
              p_label: string
              p_order_id: string
              p_tenant_id: string
            }
            Returns: Json
          }
      flag_unserved_deliveries: { Args: never; Returns: number }
      get_active_categories: {
        Args: { p_provider_id?: string }
        Returns: {
          category_image: string
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string
          updated_at: string
        }[]
      }
      get_active_payment_providers: {
        Args: never
        Returns: {
          commission_rate: number
          created_at: string
          id: string
          is_active: boolean
          is_waafipay: boolean
          payment_number: string
          prefix_code: string
          provider_logo: string
          provider_name: string
          updated_at: string
          ussd_code_template: string
        }[]
      }
      get_active_providers: {
        Args: never
        Returns: {
          created_at: string
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "providers_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_customer_order_history: {
        Args: { customer_phone_number: string; p_tenant_id?: string }
        Returns: {
          created_at: string
          customer_phone: string
          data_amount: string
          delivered_at: string
          delivery_notes: string
          delivery_status: string
          external_ref: string
          id: string
          invoice_url: string
          package_id: string
          package_name: string
          payment_source: string
          provider_id: string
          provider_logo: string
          provider_name: string
          receiver_phone: string
          selling_price: number
          sender_phone: string
          status: string
          validity_days: string
        }[]
      }
      get_discovery_queue_status:
        | { Args: { p_id: string }; Returns: Json }
        | { Args: { p_id: string; p_tenant_id: string }; Returns: Json }
      get_discovery_root_ids: {
        Args: { p_provider_id: string }
        Returns: {
          package_id: string
        }[]
      }
      get_featured_packages: {
        Args: never
        Returns: {
          connection_type_label: string
          data_amount: string
          display_order: number
          package_id: string
          package_name: string
          provider_id: string
          provider_logo: string
          provider_name: string
          selling_price: number
        }[]
      }
      get_most_purchased_packages: {
        Args: never
        Returns: {
          connection_type_label: string
          data_amount: string
          package_id: string
          package_name: string
          provider_id: string
          provider_logo: string
          provider_name: string
          purchase_count: number
          selling_price: number
        }[]
      }
      get_package_discovery:
        | { Args: { p_id: string }; Returns: Json }
        | { Args: { p_id: string; p_tenant_id: string }; Returns: Json }
      get_public_packages: {
        Args: { p_provider_id: string }
        Returns: {
          category_id: string
          connection_type_label: string
          cost_price: number
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          package_name: string
          provider_id: string
          selling_price: number
          ussd_code: string
          validity_days: string
        }[]
      }
      get_reseller_overrides: {
        Args: never
        Returns: {
          base_price: number
          kind: string
          payment_number: string
          ref_id: string
          sell_price: number
        }[]
      }
      get_tenant_app_settings: {
        Args: never
        Returns: {
          created_at: string
          description: string
          id: string
          setting_key: string
          setting_value: boolean | null
          tenant_id: string
          text_value: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tenant_banners: {
        Args: never
        Returns: {
          alt_text: string | null
          banner_image: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          media_type: string | null
          rotation_interval: number | null
          tenant_id: string
          updated_at: string
          video_duration: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "banners_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tenant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          accent_color: string
          current_period_end: string
          id: string
          is_demo: boolean
          logo_url: string
          name: string
          plan_id: string
          primary_color: string
          slug: string
          status: string
          support_phone: string
          suspended_at: string
          suspension_kind: string
          suspension_reason: string
          trial_ends_at: string
        }[]
      }
      get_tenant_delivery_instructions: {
        Args: never
        Returns: {
          category_id: string | null
          code_template: string | null
          created_at: string
          execution_order: number | null
          id: string
          instruction_template: string | null
          instruction_type: string
          notes: string | null
          order_id: string | null
          package_id: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string | null
          sim_password: string | null
          status: string | null
          tenant_id: string
          ussd_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "delivery_instructions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tenant_owner_emails: {
        Args: never
        Returns: {
          owner_email: string
          tenant_id: string
        }[]
      }
      get_tenant_push_credentials: {
        Args: { p_tenant_id: string }
        Returns: {
          enabled: boolean
          onesignal_app_id: string
          rest_api_key: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_212_discovery_root: {
        Args: { p_package_id: string; p_tenant_id: string }
        Returns: boolean
      }
      is_demo_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      is_own_workspace_object_path: {
        Args: { p_name: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      mark_delivery_dispatched: {
        Args: { p_device_id: string; p_queue_id: string }
        Returns: boolean
      }
      release_discovery_session: { Args: { p_id: string }; Returns: Json }
      request_header_tenant_id: { Args: never; Returns: string }
      request_package_discovery:
        | {
            Args: { p_phone: string; p_root_package_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_phone: string
              p_root_package_id: string
              p_tenant_id: string
            }
            Returns: Json
          }
      seed_tenant_from_template: {
        Args: { p_source: string; p_target: string }
        Returns: Json
      }
      set_sim_pin: {
        Args: { _pin: string; _provider_name: string }
        Returns: Json
      }
      set_tenant_push_config: {
        Args: {
          p_enabled?: boolean
          p_onesignal_app_id: string
          p_rest_api_key: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      somlink_admin_configure_runtime: {
        Args: { p_edge_base_url: string; p_enabled?: boolean }
        Returns: Json
      }
      somlink_admin_credentials: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      somlink_admin_delete: { Args: { p_tenant_id: string }; Returns: Json }
      somlink_admin_dispatch_secret: { Args: never; Returns: string }
      somlink_admin_runtime_status: { Args: never; Returns: Json }
      somlink_admin_save: {
        Args: {
          p_is_active?: boolean
          p_password?: string
          p_tenant_id: string
          p_wallet_phone: string
        }
        Returns: Json
      }
      somlink_admin_set_connection: {
        Args: {
          p_error?: string
          p_is_active?: boolean
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      somlink_admin_status: { Args: { p_tenant_id: string }; Returns: Json }
      somlink_tenant_ready: { Args: never; Returns: boolean }
      storefront_phone_is_verified: {
        Args: { p_phone: string }
        Returns: boolean
      }
      storefront_register_verified_phone: {
        Args: { p_code?: string; p_phone: string }
        Returns: undefined
      }
      storefront_save_offline_registration:
        | {
            Args: {
              p_provider_id?: string
              p_provider_name?: string
              p_receiver: string
              p_sender: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_package_id?: string
              p_package_name?: string
              p_provider_id?: string
              p_provider_name?: string
              p_receiver: string
              p_sender: string
            }
            Returns: undefined
          }
      tenant_sim_routes: {
        Args: { p_tenant_id: string }
        Returns: {
          available: boolean
          device_id: string
          priority: number
          provider: string
          sim_slot: number
        }[]
      }
      ussd_duration_key: { Args: { p_label: string }; Returns: string }
      ussd_normalize_label: { Args: { p_label: string }; Returns: string }
      ussd_strip_price_prefix: { Args: { p_label: string }; Returns: string }
      waafipay_admin_credentials: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      waafipay_admin_delete: { Args: { p_tenant_id: string }; Returns: Json }
      waafipay_admin_save: {
        Args: {
          p_api_key?: string
          p_api_user_id: string
          p_environment?: string
          p_is_active?: boolean
          p_merchant_uid: string
          p_tenant_id: string
        }
        Returns: Json
      }
      waafipay_admin_status: { Args: { p_tenant_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "moderator"
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
      app_role: ["admin", "super_admin", "moderator"],
    },
  },
} as const
