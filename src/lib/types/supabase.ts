export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  info: {
    Tables: {
      documents: {
        Row: {
          content: string
          created_at: string
          kind: Database["info"]["Enums"]["kind"]
          version: number
        }
        ComputedFields: never
        Insert: {
          content: string
          created_at?: string
          kind: Database["info"]["Enums"]["kind"]
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          kind?: Database["info"]["Enums"]["kind"]
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      kind: "privacy_policy" | "user_tos" | "scripter_tos"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  payments: {
    Tables: {
      accounts: {
        Row: {
          credits: number
          earnings: number
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          credits?: number
          earnings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          credits?: number
          earnings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      config: {
        Row: {
          id: boolean
          min_balance_minutes: number
          platform_fee_bps: number
          session_timeout_minutes: number
        }
        ComputedFields: never
        Insert: {
          id?: boolean
          min_balance_minutes?: number
          platform_fee_bps?: number
          session_timeout_minutes?: number
        }
        Update: {
          id?: boolean
          min_balance_minutes?: number
          platform_fee_bps?: number
          session_timeout_minutes?: number
        }
        Relationships: []
      }
      credits_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          granted_by: string | null
          id: number
          kind: Database["payments"]["Enums"]["credit_kind"]
          minutes: number | null
          note: string | null
          payment_id: string | null
          script_id: string | null
          session_id: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          granted_by?: string | null
          id?: never
          kind: Database["payments"]["Enums"]["credit_kind"]
          minutes?: number | null
          note?: string | null
          payment_id?: string | null
          script_id?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          granted_by?: string | null
          id?: never
          kind?: Database["payments"]["Enums"]["credit_kind"]
          minutes?: number | null
          note?: string | null
          payment_id?: string | null
          script_id?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_ledger_payment_id_fkey"
            columns: ["payment_id"]
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: number
          kind: Database["payments"]["Enums"]["earning_kind"]
          minutes: number | null
          note: string | null
          script_id: string | null
          session_id: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: never
          kind: Database["payments"]["Enums"]["earning_kind"]
          minutes?: number | null
          note?: string | null
          script_id?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: never
          kind?: Database["payments"]["Enums"]["earning_kind"]
          minutes?: number | null
          note?: string | null
          script_id?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          bonus: number
          created_at: string
          credits: number
          currency: string
          id: string
          paid_at: string | null
          provider: Database["payments"]["Enums"]["provider"]
          provider_id: string
          status: Database["payments"]["Enums"]["payment_status"]
          user_id: string
        }
        ComputedFields: never
        Insert: {
          amount: number
          bonus?: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          paid_at?: string | null
          provider: Database["payments"]["Enums"]["provider"]
          provider_id: string
          status?: Database["payments"]["Enums"]["payment_status"]
          user_id: string
        }
        Update: {
          amount?: number
          bonus?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: Database["payments"]["Enums"]["provider"]
          provider_id?: string
          status?: Database["payments"]["Enums"]["payment_status"]
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          author_id: string
          charged_until: string
          end_reason: Database["payments"]["Enums"]["session_end"] | null
          ended_at: string | null
          id: string
          last_seen: string
          price: number
          revision: number
          script_id: string
          started_at: string
          unpaid: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          author_id: string
          charged_until?: string
          end_reason?: Database["payments"]["Enums"]["session_end"] | null
          ended_at?: string | null
          id?: string
          last_seen?: string
          price: number
          revision: number
          script_id: string
          started_at?: string
          unpaid?: number
          user_id: string
        }
        Update: {
          author_id?: string
          charged_until?: string
          end_reason?: Database["payments"]["Enums"]["session_end"] | null
          ended_at?: string | null
          id?: string
          last_seen?: string
          price?: number
          revision?: number
          script_id?: string
          started_at?: string
          unpaid?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_credits: {
        Args: {
          p_admin: string
          p_amount: number
          p_note: string
          p_user: string
        }
        Returns: number
      }
      average_price: { Args: Record<PropertyKey, never>; Returns: number }
      charge_session: {
        Args: { p_minutes: number; p_session: string }
        Returns: number
      }
      end_session: {
        Args: {
          p_reason: Database["payments"]["Enums"]["session_end"]
          p_session: string
        }
        Returns: number
      }
      end_stale_sessions: { Args: Record<PropertyKey, never>; Returns: number }
      end_user_sessions: { Args: { p_user: string }; Returns: number }
      heartbeat_session: { Args: { p_session: string }; Returns: boolean }
      post_credits: {
        Args: {
          p_actor?: string
          p_amount: number
          p_kind: Database["payments"]["Enums"]["credit_kind"]
          p_minutes?: number
          p_note?: string
          p_payment?: string
          p_script?: string
          p_session?: string
          p_user: string
        }
        Returns: number
      }
      post_earnings: {
        Args: {
          p_amount: number
          p_kind: Database["payments"]["Enums"]["earning_kind"]
          p_minutes?: number
          p_note?: string
          p_script?: string
          p_session?: string
          p_user: string
        }
        Returns: number
      }
      required_balance: { Args: { p_price: number }; Returns: number }
      settle_payment: { Args: { p_payment: string }; Returns: boolean }
      start_session: {
        Args: { p_script: string; p_user: string }
        Returns: {
          files: string[]
          revision: number
          session_id: string
        }[]
      }
      transfer_earnings: { Args: { p_amount: number }; Returns: number }
    }
    Enums: {
      credit_kind: "topup" | "usage" | "transfer" | "refund" | "adjustment"
      earning_kind: "sale" | "transfer" | "withdrawal" | "adjustment"
      payment_status: "pending" | "paid" | "expired" | "invalid"
      provider: "bitcart" | "stripe" | "molly"
      session_end: "stopped" | "timeout" | "insufficient_credits"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  profiles: {
    Tables: {
      bans: {
        Row: {
          admin_id: string
          banned: boolean
          created_at: string
          id: number
          reason: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          admin_id: string
          banned: boolean
          created_at?: string
          id?: never
          reason: string
          user_id: string
        }
        Update: {
          admin_id?: string
          banned?: boolean
          created_at?: string
          id?: never
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      impersonations: {
        Row: {
          admin_id: string
          created_at: string
          id: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          admin_id: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string
          banned_at: string | null
          created_at: string
          id: string
          role: Database["profiles"]["Enums"]["roles"]
          username: string
        }
        ComputedFields: never
        Insert: {
          avatar?: string
          banned_at?: string | null
          created_at?: string
          id: string
          role?: Database["profiles"]["Enums"]["roles"]
          username: string
        }
        Update: {
          avatar?: string
          banned_at?: string | null
          created_at?: string
          id?: string
          role?: Database["profiles"]["Enums"]["roles"]
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_avatar: { Args: { url: string }; Returns: string }
      clean_username: { Args: { id: string; name: string }; Returns: string }
      get_provider_id: {
        Args: { provider: string; user_id: string }
        Returns: string
      }
      get_roles_enum: { Args: Record<PropertyKey, never>; Returns: string[] }
      get_user_id: {
        Args: { provider: string; provider_id: string }
        Returns: string
      }
      is_banned: { Args: { user_id: string }; Returns: boolean }
      is_role:
        | {
            Args: { target_role: Database["profiles"]["Enums"]["roles"] }
            Returns: boolean
          }
        | {
            Args: {
              target_role: Database["profiles"]["Enums"]["roles"]
              user_id: string
            }
            Returns: boolean
          }
      log_impersonation: {
        Args: { p_admin: string; p_user: string }
        Returns: undefined
      }
      min_role: {
        Args: {
          target_role: Database["profiles"]["Enums"]["roles"]
          user_id: string
        }
        Returns: boolean
      }
      set_banned: {
        Args: {
          p_admin: string
          p_banned: boolean
          p_reason: string
          p_user: string
        }
        Returns: boolean
      }
      uid: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      roles:
        | "user"
        | "contributor"
        | "tester"
        | "scripter"
        | "moderator"
        | "administrator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_hmac: {
        Args: { message: string; secret_key: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  scripts: {
    Tables: {
      bundles: {
        Row: {
          author: string
          id: string
          name: string
          scripts: string[]
        }
        ComputedFields: never
        Insert: {
          author?: string
          id?: string
          name: string
          scripts: string[]
        }
        Update: {
          author?: string
          id?: string
          name?: string
          scripts?: string[]
        }
        Relationships: []
      }
      deploy_tokens: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_used_at: string | null
          name: string
          script_id: string
          token_hash: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          name: string
          script_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_used_at?: string | null
          name?: string
          script_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "deploy_tokens_script_id_fkey"
            columns: ["script_id"]
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata: {
        Row: {
          categories: Database["scripts"]["Enums"]["category"][]
          id: string
          price: number
          stage: Database["scripts"]["Enums"]["stage"]
          type: Database["scripts"]["Enums"]["type"]
        }
        ComputedFields: never
        Insert: {
          categories?: Database["scripts"]["Enums"]["category"][]
          id: string
          price?: number
          stage?: Database["scripts"]["Enums"]["stage"]
          type?: Database["scripts"]["Enums"]["type"]
        }
        Update: {
          categories?: Database["scripts"]["Enums"]["category"][]
          id?: string
          price?: number
          stage?: Database["scripts"]["Enums"]["stage"]
          type?: Database["scripts"]["Enums"]["type"]
        }
        Relationships: [
          {
            foreignKeyName: "metadata_id_fkey"
            columns: ["id"]
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      protected: {
        Row: {
          author: string
          created_at: string
          id: string
          last_revision: number
          revision: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          author?: string
          created_at?: string
          id: string
          last_revision?: number
          revision?: number
          updated_at?: string
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          last_revision?: number
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protected_id_fkey"
            columns: ["id"]
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          content: string
          description: string
          id: string
          published: boolean
          title: string
          url: string
        }
        ComputedFields: never
        Insert: {
          content: string
          description: string
          id?: string
          published?: boolean
          title: string
          url?: string
        }
        Update: {
          content?: string
          description?: string
          id?: string
          published?: boolean
          title?: string
          url?: string
        }
        Relationships: []
      }
      slugs: {
        Row: {
          id: string
          slug: string
        }
        ComputedFields: never
        Insert: {
          id: string
          slug: string
        }
        Update: {
          id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "slugs_id_fkey"
            columns: ["id"]
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      versions: {
        Row: {
          created_at: string
          files: string[]
          id: string
          published_at: string | null
          revision: number
          status: Database["scripts"]["Enums"]["version_status"]
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          files: string[]
          id: string
          published_at?: string | null
          revision: number
          status?: Database["scripts"]["Enums"]["version_status"]
        }
        Update: {
          created_at?: string
          files?: string[]
          id?: string
          published_at?: string | null
          revision?: number
          status?: Database["scripts"]["Enums"]["version_status"]
        }
        Relationships: [
          {
            foreignKeyName: "versions_id_fkey"
            columns: ["id"]
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access:
        | { Args: { accesser_id: string; script_id: string }; Returns: boolean }
        | { Args: { script_id: string }; Returns: boolean }
      can_upload: { Args: { object_name: string }; Returns: boolean }
      can_view: {
        Args: { script_id: string; viewer_id: string }
        Returns: boolean
      }
      discard_version: {
        Args: { revision: number; script_id: string }
        Returns: undefined
      }
      get_authors: {
        Args: { script_ids: string[] }
        Returns: {
          script_id: string
          username: string
        }[]
      }
      get_revision: { Args: { script_id: string }; Returns: number }
      is_author: {
        Args: { script_id: string; user_id: string }
        Returns: boolean
      }
      is_object_author: {
        Args: { object_name: string; user_id: string }
        Returns: boolean
      }
      is_premium: { Args: { script_id: string }; Returns: boolean }
      is_stage: {
        Args: {
          script_id: string
          target_stage: Database["scripts"]["Enums"]["stage"]
        }
        Returns: boolean
      }
      max_stage: {
        Args: {
          script_id: string
          target_stage: Database["scripts"]["Enums"]["stage"]
        }
        Returns: boolean
      }
      min_stage: {
        Args: {
          script_id: string
          target_stage: Database["scripts"]["Enums"]["stage"]
        }
        Returns: boolean
      }
      publish_version: {
        Args: { revision: number; script_id: string }
        Returns: undefined
      }
      safe_uuid: { Args: { value: string }; Returns: string }
      use_deploy_token: {
        Args: { p_script: string; p_token_hash: string }
        Returns: string
      }
      valid_files: { Args: { files: string[] }; Returns: boolean }
    }
    Enums: {
      category:
        | "combat"
        | "boss"
        | "minigame"
        | "moneymaker"
        | "tool"
        | "magic"
        | "prayer"
        | "mining"
        | "fishing"
        | "woodcutting"
        | "hunter"
        | "farming"
        | "cooking"
        | "smithing"
        | "fletching"
        | "firemaking"
        | "herblore"
        | "crafting"
        | "construction"
        | "agility"
        | "slayer"
        | "thieving"
        | "runecrafting"
        | "sailing"
      stage: "prototype" | "alpha" | "beta" | "stable" | "archived"
      type: "premium" | "free"
      version_status: "pending" | "live" | "discarded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  stats: {
    Tables: {
      limits: {
        Row: {
          gp_max: number
          gp_min: number
          id: string
          xp_max: number
          xp_min: number
        }
        ComputedFields: never
        Insert: {
          gp_max?: number
          gp_min?: number
          id: string
          xp_max?: number
          xp_min?: number
        }
        Update: {
          gp_max?: number
          gp_min?: number
          id?: string
          xp_max?: number
          xp_min?: number
        }
        Relationships: []
      }
      limits_custom: {
        Row: {
          id: string
          maxima: number[]
          minima: number[]
          trackers: string[]
        }
        ComputedFields: never
        Insert: {
          id: string
          maxima?: number[]
          minima?: number[]
          trackers?: string[]
        }
        Update: {
          id?: string
          maxima?: number[]
          minima?: number[]
          trackers?: string[]
        }
        Relationships: []
      }
      stats: {
        Row: {
          experience: number
          gold: number
          id: string
          levels: number
          runtime: number
        }
        ComputedFields: never
        Insert: {
          experience?: number
          gold?: number
          id: string
          levels?: never
          runtime?: number
        }
        Update: {
          experience?: number
          gold?: number
          id?: string
          levels?: never
          runtime?: number
        }
        Relationships: []
      }
      values: {
        Row: {
          experience: number
          gold: number
          id: string
          levels: number
          runtime: number
        }
        ComputedFields: never
        Insert: {
          experience?: number
          gold?: number
          id: string
          levels?: never
          runtime?: number
        }
        Update: {
          experience?: number
          gold?: number
          id?: string
          levels?: never
          runtime?: number
        }
        Relationships: []
      }
      values_custom: {
        Row: {
          id: string
          values: number[]
        }
        ComputedFields: never
        Insert: {
          id: string
          values?: number[]
        }
        Update: {
          id?: string
          values?: number[]
        }
        Relationships: []
      }
      website: {
        Row: {
          downloads: string[]
          id: string
          total: number | null
        }
        ComputedFields: never
        Insert: {
          downloads?: string[]
          id: string
          total?: never
        }
        Update: {
          downloads?: string[]
          id?: string
          total?: never
        }
        Relationships: []
      }
      website_monthly: {
        Row: {
          date: string
          downloads: string[]
          id: string
          total: number | null
        }
        ComputedFields: never
        Insert: {
          date?: string
          downloads?: string[]
          id: string
          total?: never
        }
        Update: {
          date?: string
          downloads?: string[]
          id?: string
          total?: never
        }
        Relationships: []
      }
    }
    Views: {
      totals: {
        Row: {
          experience: number | null
          gold: number | null
          levels: number | null
          runtime: number | null
        }
        ComputedFields: never
        Relationships: []
      }
    }
    Functions: {
      can_manage: { Args: { script_id: string }; Returns: boolean }
      get_level: { Args: { experience: number }; Returns: number }
      increment_script_stats: {
        Args: {
          add_experience: number
          add_gold: number
          add_runtime: number
          script_id: string
        }
        Returns: undefined
      }
      increment_user_stats: {
        Args: {
          add_experience: number
          add_gold: number
          add_runtime: number
          user_id: string
        }
        Returns: undefined
      }
      online_count: { Args: Record<PropertyKey, never>; Returns: number }
      report_session: {
        Args: {
          p_custom?: number[]
          p_experience: number
          p_gold: number
          p_minutes: number
          p_session: string
        }
        Returns: undefined
      }
      online_per_script: {
        Args: Record<PropertyKey, never>
        Returns: {
          script_id: string
          users: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          lifecycle_configuration: Json | null
          lifecycle_configuration_generation: string | null
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        ComputedFields: never
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: NonNullable<Json>
          name: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: NonNullable<Json>
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: NonNullable<Json>
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        ComputedFields: never
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: never
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: never
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: { delete_markers?: string; noncurrent_versions?: string }
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
          raw_prefix_param?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delete_markers?: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          next_token_archived_at?: string
          next_token_version?: string
          noncurrent_versions?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      operation: { Args: Record<PropertyKey, never>; Returns: string }
      search: {
        Args: {
          bucketname: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          delete_markers?: string
          noncurrent_versions?: string
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
          p_start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
          start_after_archived_at?: string
          start_after_is_continuation?: boolean
          start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  info: {
    Enums: {
      kind: ["privacy_policy", "user_tos", "scripter_tos"],
    },
  },
  payments: {
    Enums: {
      credit_kind: ["topup", "usage", "transfer", "refund", "adjustment"],
      earning_kind: ["sale", "transfer", "withdrawal", "adjustment"],
      payment_status: ["pending", "paid", "expired", "invalid"],
      provider: ["bitcart", "stripe", "molly"],
      session_end: ["stopped", "timeout", "insufficient_credits"],
    },
  },
  profiles: {
    Enums: {
      roles: [
        "user",
        "contributor",
        "tester",
        "scripter",
        "moderator",
        "administrator",
      ],
    },
  },
  public: {
    Enums: {},
  },
  scripts: {
    Enums: {
      category: [
        "combat",
        "boss",
        "minigame",
        "moneymaker",
        "tool",
        "magic",
        "prayer",
        "mining",
        "fishing",
        "woodcutting",
        "hunter",
        "farming",
        "cooking",
        "smithing",
        "fletching",
        "firemaking",
        "herblore",
        "crafting",
        "construction",
        "agility",
        "slayer",
        "thieving",
        "runecrafting",
        "sailing",
      ],
      stage: ["prototype", "alpha", "beta", "stable", "archived"],
      type: ["premium", "free"],
      version_status: ["pending", "live", "discarded"],
    },
  },
  stats: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
