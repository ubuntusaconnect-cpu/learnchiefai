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
      activity_events: {
        Row: {
          content_id: string | null
          created_at: string
          duration_seconds: number | null
          event_type: string
          grade: number | null
          id: string
          lesson_id: string | null
          metadata: Json
          occurred_at: string
          offline: boolean
          session_id: string | null
          subject: string | null
          synced_at: string
          topic: string | null
          user_id: string
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          event_type: string
          grade?: number | null
          id: string
          lesson_id?: string | null
          metadata?: Json
          occurred_at: string
          offline?: boolean
          session_id?: string | null
          subject?: string | null
          synced_at?: string
          topic?: string | null
          user_id: string
        }
        Update: {
          content_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          event_type?: string
          grade?: number | null
          id?: string
          lesson_id?: string | null
          metadata?: Json
          occurred_at?: string
          offline?: boolean
          session_id?: string | null
          subject?: string | null
          synced_at?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learner_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          detail: string | null
          id: string
          record_id: string | null
          record_type: string | null
          subject_user_id: string | null
          success: boolean
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          detail?: string | null
          id?: string
          record_id?: string | null
          record_type?: string | null
          subject_user_id?: string | null
          success?: boolean
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          record_id?: string | null
          record_type?: string | null
          subject_user_id?: string | null
          success?: boolean
        }
        Relationships: []
      }
      ai_cache: {
        Row: {
          created_at: string
          hits: number
          last_hit_at: string | null
          model: string | null
          prompt_hash: string
          provider: string | null
          response: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          created_at?: string
          hits?: number
          last_hit_at?: string | null
          model?: string | null
          prompt_hash: string
          provider?: string | null
          response: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          created_at?: string
          hits?: number
          last_hit_at?: string | null
          model?: string | null
          prompt_hash?: string
          provider?: string | null
          response?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          grade: number | null
          id: string
          offline: boolean
          subject: string | null
          title: string
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grade?: number | null
          id?: string
          offline?: boolean
          subject?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grade?: number | null
          id?: string
          offline?: boolean
          subject?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_message_attachments: {
        Row: {
          conversation_id: string
          created_at: string
          extracted_text: string | null
          file_name: string
          id: string
          kind: string
          message_id: string | null
          mime_type: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          extracted_text?: string | null
          file_name: string
          id?: string
          kind?: string
          message_id?: string | null
          mime_type: string
          size_bytes?: number
          storage_path: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          id?: string
          kind?: string
          message_id?: string | null
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          duration_ms: number | null
          id: string
          model: string | null
          offline: boolean
          provider: string | null
          role: string
          status: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          model?: string | null
          offline?: boolean
          provider?: string | null
          role: string
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          model?: string | null
          offline?: boolean
          provider?: string | null
          role?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_configs: {
        Row: {
          created_at: string
          enabled: boolean
          has_key: boolean
          id: string
          last_test_at: string | null
          last_test_error: string | null
          last_test_latency_ms: number | null
          last_test_ok: boolean | null
          model: string | null
          priority: number
          provider_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          has_key?: boolean
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_ok?: boolean | null
          model?: string | null
          priority?: number
          provider_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          has_key?: boolean
          id?: string
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_ok?: boolean | null
          model?: string | null
          priority?: number
          provider_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_provider_secrets: {
        Row: {
          api_key: string
          provider_key: string
          updated_at: string
        }
        Insert: {
          api_key: string
          provider_key: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          provider_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_request_logs: {
        Row: {
          cached: boolean
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          model: string | null
          operation: string | null
          provider: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          cached?: boolean
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          operation?: string | null
          provider: string
          status: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          cached?: boolean
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          model?: string | null
          operation?: string | null
          provider?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      content_progress: {
        Row: {
          client_updated_at: string
          completed: boolean
          content_id: string
          created_at: string
          duration_seconds: number | null
          id: string
          position_seconds: number
          updated_at: string
          user_id: string
          watched_offline: boolean
        }
        Insert: {
          client_updated_at?: string
          completed?: boolean
          content_id: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          updated_at?: string
          user_id: string
          watched_offline?: boolean
        }
        Update: {
          client_updated_at?: string
          completed?: boolean
          content_id?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          updated_at?: string
          user_id?: string
          watched_offline?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "content_progress_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "learning_content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_uploads: {
        Row: {
          ai_classification: Json | null
          bucket: string | null
          confidence: Json | null
          content_type: string | null
          created_at: string
          destination: Json | null
          duplicate_decision: string | null
          duplicate_kind: string | null
          duplicate_of_content_id: string | null
          duplicate_of_paper_id: string | null
          duplicate_score: number | null
          error_message: string | null
          extracted_text: string | null
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          needs_review: boolean
          original_filename: string
          overall_confidence: number | null
          progress: number
          published_content_id: string | null
          published_paper_id: string | null
          sha256: string | null
          stage: string
          status: string
          text_hash: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          ai_classification?: Json | null
          bucket?: string | null
          confidence?: Json | null
          content_type?: string | null
          created_at?: string
          destination?: Json | null
          duplicate_decision?: string | null
          duplicate_kind?: string | null
          duplicate_of_content_id?: string | null
          duplicate_of_paper_id?: string | null
          duplicate_score?: number | null
          error_message?: string | null
          extracted_text?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          needs_review?: boolean
          original_filename: string
          overall_confidence?: number | null
          progress?: number
          published_content_id?: string | null
          published_paper_id?: string | null
          sha256?: string | null
          stage?: string
          status?: string
          text_hash?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          ai_classification?: Json | null
          bucket?: string | null
          confidence?: Json | null
          content_type?: string | null
          created_at?: string
          destination?: Json | null
          duplicate_decision?: string | null
          duplicate_kind?: string | null
          duplicate_of_content_id?: string | null
          duplicate_of_paper_id?: string | null
          duplicate_score?: number | null
          error_message?: string | null
          extracted_text?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          needs_review?: boolean
          original_filename?: string
          overall_confidence?: number | null
          progress?: number
          published_content_id?: string | null
          published_paper_id?: string | null
          sha256?: string | null
          stage?: string
          status?: string
          text_hash?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_uploads_duplicate_of_content_id_fkey"
            columns: ["duplicate_of_content_id"]
            isOneToOne: false
            referencedRelation: "learning_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_uploads_duplicate_of_paper_id_fkey"
            columns: ["duplicate_of_paper_id"]
            isOneToOne: false
            referencedRelation: "question_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_uploads_published_content_id_fkey"
            columns: ["published_content_id"]
            isOneToOne: false
            referencedRelation: "learning_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_uploads_published_paper_id_fkey"
            columns: ["published_paper_id"]
            isOneToOne: false
            referencedRelation: "question_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          bucket: string | null
          changed_by: string | null
          content_id: string | null
          created_at: string
          file_path: string | null
          id: string
          note: string | null
          paper_id: string | null
          sha256: string | null
          snapshot: Json | null
          version: number
        }
        Insert: {
          bucket?: string | null
          changed_by?: string | null
          content_id?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          note?: string | null
          paper_id?: string | null
          sha256?: string | null
          snapshot?: Json | null
          version: number
        }
        Update: {
          bucket?: string | null
          changed_by?: string | null
          content_id?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          note?: string | null
          paper_id?: string | null
          sha256?: string | null
          snapshot?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "learning_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "question_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          grade: string | null
          id: string
          is_published: boolean
          level: string | null
          slug: string
          subject_id: string | null
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          grade?: string | null
          id?: string
          is_published?: boolean
          level?: string | null
          slug: string
          subject_id?: string | null
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          grade?: string | null
          id?: string
          is_published?: boolean
          level?: string | null
          slug?: string
          subject_id?: string | null
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_nodes: {
        Row: {
          created_at: string
          grade: number | null
          id: string
          kind: string
          name: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade?: number | null
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: number | null
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_sessions: {
        Row: {
          created_at: string
          device: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          last_seen_at: string
          platform: string | null
          started_at: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string | null
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string | null
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      learning_content: {
        Row: {
          ai_analysis: Json | null
          archived: boolean
          bucket: string | null
          confidence: Json | null
          content_type: string
          created_at: string
          curriculum_node_id: string | null
          description: string | null
          difficulty: string | null
          duration_seconds: number | null
          error_message: string | null
          exam_type: string | null
          extracted_text: string | null
          file_path: string | null
          file_size: number | null
          grade: number | null
          id: string
          keywords: string[]
          language: string | null
          mime_type: string | null
          needs_confirmation: boolean
          objectives: string[]
          original_filename: string | null
          paper_number: number | null
          published_at: string | null
          search_tags: string[]
          search_vector: unknown
          section: string | null
          sha256: string | null
          status: string
          subject: string | null
          subtopic: string | null
          term: number | null
          text_hash: string | null
          thumbnail_path: string | null
          thumbnail_suggestion: string | null
          title: string
          topic: string | null
          transcript: string | null
          updated_at: string
          uploaded_by: string | null
          version: number
          year: number | null
        }
        Insert: {
          ai_analysis?: Json | null
          archived?: boolean
          bucket?: string | null
          confidence?: Json | null
          content_type?: string
          created_at?: string
          curriculum_node_id?: string | null
          description?: string | null
          difficulty?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          exam_type?: string | null
          extracted_text?: string | null
          file_path?: string | null
          file_size?: number | null
          grade?: number | null
          id?: string
          keywords?: string[]
          language?: string | null
          mime_type?: string | null
          needs_confirmation?: boolean
          objectives?: string[]
          original_filename?: string | null
          paper_number?: number | null
          published_at?: string | null
          search_tags?: string[]
          search_vector?: unknown
          section?: string | null
          sha256?: string | null
          status?: string
          subject?: string | null
          subtopic?: string | null
          term?: number | null
          text_hash?: string | null
          thumbnail_path?: string | null
          thumbnail_suggestion?: string | null
          title?: string
          topic?: string | null
          transcript?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          year?: number | null
        }
        Update: {
          ai_analysis?: Json | null
          archived?: boolean
          bucket?: string | null
          confidence?: Json | null
          content_type?: string
          created_at?: string
          curriculum_node_id?: string | null
          description?: string | null
          difficulty?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          exam_type?: string | null
          extracted_text?: string | null
          file_path?: string | null
          file_size?: number | null
          grade?: number | null
          id?: string
          keywords?: string[]
          language?: string | null
          mime_type?: string | null
          needs_confirmation?: boolean
          objectives?: string[]
          original_filename?: string | null
          paper_number?: number | null
          published_at?: string | null
          search_tags?: string[]
          search_vector?: unknown
          section?: string | null
          sha256?: string | null
          status?: string
          subject?: string | null
          subtopic?: string | null
          term?: number | null
          text_hash?: string | null
          thumbnail_path?: string | null
          thumbnail_suggestion?: string | null
          title?: string
          topic?: string | null
          transcript?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_content_curriculum_node_id_fkey"
            columns: ["curriculum_node_id"]
            isOneToOne: false
            referencedRelation: "curriculum_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          id: string
          lesson_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          id?: string
          lesson_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          module_id: string
          notes_url: string | null
          position: number
          title: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          module_id: string
          notes_url?: string | null
          position?: number
          title: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          module_id?: string
          notes_url?: string | null
          position?: number
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          grade: string | null
          id: string
          last_login_at: string | null
          last_logout_at: string | null
          last_seen_at: string | null
          login_count: number
          school: string | null
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          grade?: string | null
          id: string
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          login_count?: number
          school?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          grade?: string | null
          id?: string
          last_login_at?: string | null
          last_logout_at?: string | null
          last_seen_at?: string | null
          login_count?: number
          school?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      question_papers: {
        Row: {
          created_at: string
          description: string | null
          exam_type: string | null
          grade: number
          id: string
          memo_path: string | null
          memo_sha256: string | null
          memo_url: string | null
          paper_number: number | null
          paper_path: string | null
          paper_url: string | null
          sha256: string | null
          subject: string
          term: number
          title: string
          updated_at: string
          uploaded_by: string | null
          version: number
          year: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_type?: string | null
          grade: number
          id?: string
          memo_path?: string | null
          memo_sha256?: string | null
          memo_url?: string | null
          paper_number?: number | null
          paper_path?: string | null
          paper_url?: string | null
          sha256?: string | null
          subject: string
          term: number
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          year: number
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_type?: string | null
          grade?: number
          id?: string
          memo_path?: string | null
          memo_sha256?: string | null
          memo_url?: string | null
          paper_number?: number | null
          paper_path?: string | null
          paper_url?: string | null
          sha256?: string | null
          subject?: string
          term?: number
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
          year?: number
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          quiz_id: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: string
          explanation: string | null
          id: string
          options: Json
          position: number
          question: string
          quiz_id: string
        }
        Insert: {
          correct_answer: string
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question: string
          quiz_id: string
        }
        Update: {
          correct_answer?: string
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          course_id: string | null
          created_at: string
          description: string | null
          id: string
          lesson_id: string | null
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lesson_id?: string | null
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lesson_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          id: number
          subject: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          subject: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          subject?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          detail: Json
          event: string
          id: string
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          event: string
          id?: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          category: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
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
      user_warnings: {
        Row: {
          acknowledged_at: string | null
          category: string
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string
          message: string | null
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          revocation_note: string | null
          revoked_at: string | null
          revoked_by: string | null
          severity: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          category: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          message?: string | null
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revocation_note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          severity?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          category?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          message?: string | null
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revocation_note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          severity?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_warning: { Args: { _warning_id: string }; Returns: undefined }
      admin_dashboard_summary: { Args: never; Returns: Json }
      admin_user_detail: { Args: { _user_id: string }; Returns: Json }
      admin_user_overview: {
        Args: never
        Returns: {
          account_status: string
          ai_count: number
          ai_errors: number
          ai_last_at: string
          ai_today: number
          created_at: string
          email: string
          full_name: string
          id: string
          last_activity_at: string
          last_login_at: string
          last_logout_at: string
          last_seen_at: string
          login_count: number
          role: string
          warnings_active: number
          warnings_total: number
        }[]
      }
      admin_users_page: {
        Args: {
          _ai?: string
          _dir?: string
          _limit?: number
          _offset?: number
          _presence?: string
          _q?: string
          _role?: string
          _sort?: string
          _status?: string
          _warned?: boolean
        }
        Returns: Json
      }
      check_quiz_answer: {
        Args: { _answer: string; _question_id: string }
        Returns: Json
      }
      consume_rate_limit: {
        Args: {
          _bucket: string
          _limit: number
          _subject: string
          _window_seconds: number
        }
        Returns: Json
      }
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_activity: {
        Args: { _event_type: string; _metadata?: Json; _session_id?: string }
        Returns: undefined
      }
      record_login: {
        Args: {
          _method?: string
          _platform?: string
          _session_id: string
          _user_agent?: string
        }
        Returns: Json
      }
      record_logout: { Args: { _session_id?: string }; Returns: undefined }
      search_learning_content: {
        Args: { _content_type?: string; _grade?: number; _q: string }
        Returns: {
          ai_analysis: Json | null
          archived: boolean
          bucket: string | null
          confidence: Json | null
          content_type: string
          created_at: string
          curriculum_node_id: string | null
          description: string | null
          difficulty: string | null
          duration_seconds: number | null
          error_message: string | null
          exam_type: string | null
          extracted_text: string | null
          file_path: string | null
          file_size: number | null
          grade: number | null
          id: string
          keywords: string[]
          language: string | null
          mime_type: string | null
          needs_confirmation: boolean
          objectives: string[]
          original_filename: string | null
          paper_number: number | null
          published_at: string | null
          search_tags: string[]
          search_vector: unknown
          section: string | null
          sha256: string | null
          status: string
          subject: string | null
          subtopic: string | null
          term: number | null
          text_hash: string | null
          thumbnail_path: string | null
          thumbnail_suggestion: string | null
          title: string
          topic: string | null
          transcript: string | null
          updated_at: string
          uploaded_by: string | null
          version: number
          year: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "learning_content"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      touch_presence: { Args: { _session_id?: string }; Returns: undefined }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["student", "teacher", "admin"],
    },
  },
} as const
