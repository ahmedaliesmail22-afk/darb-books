BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(64) NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [password_hash] NVARCHAR(255) NOT NULL,
    [full_name] NVARCHAR(200) NOT NULL,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'ACTIVE',
    [email_verified_at] DATETIME2,
    [last_login_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[user_profiles] (
    [user_id] NVARCHAR(64) NOT NULL,
    [age_group_id] NVARCHAR(64),
    [education_level_id] NVARCHAR(64),
    [onboarding_completed] BIT NOT NULL CONSTRAINT [user_profiles_onboarding_completed_df] DEFAULT 0,
    [ui_prefs_json] NVARCHAR(max) NOT NULL CONSTRAINT [user_profiles_ui_prefs_json_df] DEFAULT '{}',
    [metadata_json] NVARCHAR(max) NOT NULL CONSTRAINT [user_profiles_metadata_json_df] DEFAULT '{}',
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [user_profiles_pkey] PRIMARY KEY CLUSTERED ([user_id])
);

-- CreateTable
CREATE TABLE [dbo].[user_preferred_taxonomies] (
    [user_id] NVARCHAR(64) NOT NULL,
    [taxonomy_id] NVARCHAR(64) NOT NULL,
    CONSTRAINT [user_preferred_taxonomies_pkey] PRIMARY KEY CLUSTERED ([user_id],[taxonomy_id])
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] NVARCHAR(64) NOT NULL,
    [user_id] NVARCHAR(64) NOT NULL,
    [token_hash] NVARCHAR(191) NOT NULL,
    [user_agent] NVARCHAR(500),
    [ip_address] NVARCHAR(120),
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    [replaced_by_id] NVARCHAR(64),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [refresh_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [refresh_tokens_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

-- CreateTable
CREATE TABLE [dbo].[verification_tokens] (
    [id] NVARCHAR(64) NOT NULL,
    [user_id] NVARCHAR(64) NOT NULL,
    [purpose] NVARCHAR(64) NOT NULL,
    [token_hash] NVARCHAR(191) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [used_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [verification_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [verification_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [verification_tokens_token_hash_key] UNIQUE NONCLUSTERED ([token_hash])
);

-- CreateTable
CREATE TABLE [dbo].[permissions] (
    [id] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(120) NOT NULL,
    [module] NVARCHAR(64) NOT NULL,
    [label_ar] NVARCHAR(255) NOT NULL,
    [label_en] NVARCHAR(255),
    [description] NVARCHAR(500),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [permissions_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[roles] (
    [id] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(120) NOT NULL,
    [name_ar] NVARCHAR(200) NOT NULL,
    [name_en] NVARCHAR(200),
    [description] NVARCHAR(500),
    [is_system] BIT NOT NULL CONSTRAINT [roles_is_system_df] DEFAULT 0,
    [is_active] BIT NOT NULL CONSTRAINT [roles_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [roles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [roles_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [role_id] NVARCHAR(64) NOT NULL,
    [permission_id] NVARCHAR(64) NOT NULL,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([role_id],[permission_id])
);

-- CreateTable
CREATE TABLE [dbo].[user_roles] (
    [user_id] NVARCHAR(64) NOT NULL,
    [role_id] NVARCHAR(64) NOT NULL,
    [assigned_by_id] NVARCHAR(64),
    [assigned_at] DATETIME2 NOT NULL CONSTRAINT [user_roles_assigned_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_roles_pkey] PRIMARY KEY CLUSTERED ([user_id],[role_id])
);

-- CreateTable
CREATE TABLE [dbo].[taxonomies] (
    [id] NVARCHAR(64) NOT NULL,
    [group] NVARCHAR(64) NOT NULL,
    [slug] NVARCHAR(120) NOT NULL,
    [label_ar] NVARCHAR(200) NOT NULL,
    [label_en] NVARCHAR(200),
    [description] NVARCHAR(500),
    [parent_id] NVARCHAR(64),
    [sort_order] INT NOT NULL CONSTRAINT [taxonomies_sort_order_df] DEFAULT 0,
    [is_active] BIT NOT NULL CONSTRAINT [taxonomies_is_active_df] DEFAULT 1,
    [rules_json] NVARCHAR(max) NOT NULL CONSTRAINT [taxonomies_rules_json_df] DEFAULT '{}',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [taxonomies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [taxonomies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [taxonomies_group_slug_key] UNIQUE NONCLUSTERED ([group],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[system_configs] (
    [id] NVARCHAR(64) NOT NULL,
    [key] NVARCHAR(120) NOT NULL,
    [category] NVARCHAR(64) NOT NULL,
    [value_json] NVARCHAR(max) NOT NULL,
    [description] NVARCHAR(500),
    [is_public] BIT NOT NULL CONSTRAINT [system_configs_is_public_df] DEFAULT 0,
    [updated_by_id] NVARCHAR(64),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [system_configs_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [system_configs_key_key] UNIQUE NONCLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[cms_pages] (
    [id] NVARCHAR(64) NOT NULL,
    [slug] NVARCHAR(120) NOT NULL,
    [title_ar] NVARCHAR(255) NOT NULL,
    [title_en] NVARCHAR(255),
    [seo_json] NVARCHAR(max) NOT NULL CONSTRAINT [cms_pages_seo_json_df] DEFAULT '{}',
    [is_published] BIT NOT NULL CONSTRAINT [cms_pages_is_published_df] DEFAULT 1,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [cms_pages_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [cms_pages_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[cms_sections] (
    [id] NVARCHAR(64) NOT NULL,
    [page_id] NVARCHAR(64) NOT NULL,
    [section_key] NVARCHAR(120) NOT NULL,
    [title_ar] NVARCHAR(255) NOT NULL,
    [title_en] NVARCHAR(255),
    [content_json] NVARCHAR(max) NOT NULL CONSTRAINT [cms_sections_content_json_df] DEFAULT '{}',
    [sort_order] INT NOT NULL CONSTRAINT [cms_sections_sort_order_df] DEFAULT 0,
    [is_visible] BIT NOT NULL CONSTRAINT [cms_sections_is_visible_df] DEFAULT 1,
    [updated_by_id] NVARCHAR(64),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [cms_sections_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [cms_sections_page_id_section_key_key] UNIQUE NONCLUSTERED ([page_id],[section_key])
);

-- CreateTable
CREATE TABLE [dbo].[news_posts] (
    [id] NVARCHAR(64) NOT NULL,
    [slug] NVARCHAR(160) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [summary] NVARCHAR(500),
    [body_md] NVARCHAR(max) NOT NULL,
    [cover_url] NVARCHAR(500),
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [news_posts_status_df] DEFAULT 'DRAFT',
    [published_at] DATETIME2,
    [author_id] NVARCHAR(64),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [news_posts_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [news_posts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [news_posts_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[books] (
    [id] NVARCHAR(64) NOT NULL,
    [slug] NVARCHAR(160) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [subtitle] NVARCHAR(350),
    [description] NVARCHAR(max),
    [badge] NVARCHAR(120),
    [badge_color] NVARCHAR(64),
    [theme] NVARCHAR(64) NOT NULL CONSTRAINT [books_theme_df] DEFAULT 'royal-gold',
    [direction] NVARCHAR(16) NOT NULL CONSTRAINT [books_direction_df] DEFAULT 'rtl',
    [cover_url] NVARCHAR(500),
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [books_status_df] DEFAULT 'DRAFT',
    [active_version_id] NVARCHAR(64),
    [author_id] NVARCHAR(64),
    [metadata_json] NVARCHAR(max) NOT NULL CONSTRAINT [books_metadata_json_df] DEFAULT '{}',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [books_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [books_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [books_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[book_taxonomies] (
    [book_id] NVARCHAR(64) NOT NULL,
    [taxonomy_id] NVARCHAR(64) NOT NULL,
    CONSTRAINT [book_taxonomies_pkey] PRIMARY KEY CLUSTERED ([book_id],[taxonomy_id])
);

-- CreateTable
CREATE TABLE [dbo].[book_versions] (
    [id] NVARCHAR(64) NOT NULL,
    [book_id] NVARCHAR(64) NOT NULL,
    [version_number] INT NOT NULL,
    [version_label] NVARCHAR(64) NOT NULL,
    [source_format] NVARCHAR(40) NOT NULL CONSTRAINT [book_versions_source_format_df] DEFAULT 'json',
    [source_file_url] NVARCHAR(500),
    [canonical_json_url] NVARCHAR(500),
    [canonical_data_json] NVARCHAR(max),
    [audio_dir] NVARCHAR(500),
    [video_dir] NVARCHAR(500),
    [chapters_count] INT NOT NULL CONSTRAINT [book_versions_chapters_count_df] DEFAULT 0,
    [spreads_count] INT NOT NULL CONSTRAINT [book_versions_spreads_count_df] DEFAULT 0,
    [audio_tracks_count] INT NOT NULL CONSTRAINT [book_versions_audio_tracks_count_df] DEFAULT 0,
    [videos_count] INT NOT NULL CONSTRAINT [book_versions_videos_count_df] DEFAULT 0,
    [ip_declaration_signed] BIT NOT NULL CONSTRAINT [book_versions_ip_declaration_signed_df] DEFAULT 0,
    [status] NVARCHAR(40) NOT NULL CONSTRAINT [book_versions_status_df] DEFAULT 'DRAFT',
    [submitted_at] DATETIME2,
    [published_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [book_versions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [book_versions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [book_versions_book_id_version_number_key] UNIQUE NONCLUSTERED ([book_id],[version_number])
);

-- CreateTable
CREATE TABLE [dbo].[review_tickets] (
    [id] NVARCHAR(64) NOT NULL,
    [book_version_id] NVARCHAR(64) NOT NULL,
    [reviewer_id] NVARCHAR(64),
    [checklist_json] NVARCHAR(max) NOT NULL CONSTRAINT [review_tickets_checklist_json_df] DEFAULT '{}',
    [content_verified] BIT NOT NULL CONSTRAINT [review_tickets_content_verified_df] DEFAULT 0,
    [ip_verified] BIT NOT NULL CONSTRAINT [review_tickets_ip_verified_df] DEFAULT 0,
    [decision] NVARCHAR(64),
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [review_tickets_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [review_tickets_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[media_assets] (
    [id] NVARCHAR(64) NOT NULL,
    [book_version_id] NVARCHAR(64) NOT NULL,
    [asset_type] NVARCHAR(40) NOT NULL,
    [r2_key] NVARCHAR(255) NOT NULL,
    [mime_type] NVARCHAR(120) NOT NULL,
    [size_bytes] INT NOT NULL,
    [checksum_sha256] NVARCHAR(128),
    [metadata_json] NVARCHAR(max) NOT NULL CONSTRAINT [media_assets_metadata_json_df] DEFAULT '{}',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [media_assets_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [media_assets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [media_assets_r2_key_key] UNIQUE NONCLUSTERED ([r2_key])
);

-- CreateTable
CREATE TABLE [dbo].[reading_progress] (
    [id] NVARCHAR(64) NOT NULL,
    [user_id] NVARCHAR(64) NOT NULL,
    [book_id] NVARCHAR(64) NOT NULL,
    [current_spread] INT NOT NULL CONSTRAINT [reading_progress_current_spread_df] DEFAULT 0,
    [percent] FLOAT(53) NOT NULL CONSTRAINT [reading_progress_percent_df] DEFAULT 0,
    [bookmarks_json] NVARCHAR(max) NOT NULL CONSTRAINT [reading_progress_bookmarks_json_df] DEFAULT '[]',
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [reading_progress_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [reading_progress_user_id_book_id_key] UNIQUE NONCLUSTERED ([user_id],[book_id])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] NVARCHAR(64) NOT NULL,
    [actor_id] NVARCHAR(64),
    [action] NVARCHAR(120) NOT NULL,
    [target_type] NVARCHAR(80) NOT NULL,
    [target_id] NVARCHAR(160) NOT NULL,
    [metadata_json] NVARCHAR(max) NOT NULL CONSTRAINT [audit_logs_metadata_json_df] DEFAULT '{}',
    [ip_address] NVARCHAR(120),
    [user_agent] NVARCHAR(500),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_user_id_expires_at_idx] ON [dbo].[refresh_tokens]([user_id], [expires_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [verification_tokens_user_id_purpose_idx] ON [dbo].[verification_tokens]([user_id], [purpose]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [permissions_module_idx] ON [dbo].[permissions]([module]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [taxonomies_group_is_active_sort_order_idx] ON [dbo].[taxonomies]([group], [is_active], [sort_order]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [system_configs_category_is_public_idx] ON [dbo].[system_configs]([category], [is_public]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cms_sections_page_id_is_visible_sort_order_idx] ON [dbo].[cms_sections]([page_id], [is_visible], [sort_order]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [news_posts_status_published_at_idx] ON [dbo].[news_posts]([status], [published_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [books_status_idx] ON [dbo].[books]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [book_versions_book_id_status_idx] ON [dbo].[book_versions]([book_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [review_tickets_book_version_id_idx] ON [dbo].[review_tickets]([book_version_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [media_assets_book_version_id_asset_type_idx] ON [dbo].[media_assets]([book_version_id], [asset_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_target_type_target_id_idx] ON [dbo].[audit_logs]([target_type], [target_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_actor_id_created_at_idx] ON [dbo].[audit_logs]([actor_id], [created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_logs_action_created_at_idx] ON [dbo].[audit_logs]([action], [created_at]);

-- AddForeignKey
ALTER TABLE [dbo].[user_profiles] ADD CONSTRAINT [user_profiles_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_profiles] ADD CONSTRAINT [user_profiles_age_group_id_fkey] FOREIGN KEY ([age_group_id]) REFERENCES [dbo].[taxonomies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_profiles] ADD CONSTRAINT [user_profiles_education_level_id_fkey] FOREIGN KEY ([education_level_id]) REFERENCES [dbo].[taxonomies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_preferred_taxonomies] ADD CONSTRAINT [user_preferred_taxonomies_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[user_profiles]([user_id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_preferred_taxonomies] ADD CONSTRAINT [user_preferred_taxonomies_taxonomy_id_fkey] FOREIGN KEY ([taxonomy_id]) REFERENCES [dbo].[taxonomies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[verification_tokens] ADD CONSTRAINT [verification_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permission_id_fkey] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_role_id_fkey] FOREIGN KEY ([role_id]) REFERENCES [dbo].[roles]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_roles] ADD CONSTRAINT [user_roles_assigned_by_id_fkey] FOREIGN KEY ([assigned_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[taxonomies] ADD CONSTRAINT [taxonomies_parent_id_fkey] FOREIGN KEY ([parent_id]) REFERENCES [dbo].[taxonomies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[system_configs] ADD CONSTRAINT [system_configs_updated_by_id_fkey] FOREIGN KEY ([updated_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cms_sections] ADD CONSTRAINT [cms_sections_page_id_fkey] FOREIGN KEY ([page_id]) REFERENCES [dbo].[cms_pages]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cms_sections] ADD CONSTRAINT [cms_sections_updated_by_id_fkey] FOREIGN KEY ([updated_by_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[news_posts] ADD CONSTRAINT [news_posts_author_id_fkey] FOREIGN KEY ([author_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[books] ADD CONSTRAINT [books_author_id_fkey] FOREIGN KEY ([author_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[books] ADD CONSTRAINT [books_active_version_id_fkey] FOREIGN KEY ([active_version_id]) REFERENCES [dbo].[book_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[book_taxonomies] ADD CONSTRAINT [book_taxonomies_book_id_fkey] FOREIGN KEY ([book_id]) REFERENCES [dbo].[books]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[book_taxonomies] ADD CONSTRAINT [book_taxonomies_taxonomy_id_fkey] FOREIGN KEY ([taxonomy_id]) REFERENCES [dbo].[taxonomies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[book_versions] ADD CONSTRAINT [book_versions_book_id_fkey] FOREIGN KEY ([book_id]) REFERENCES [dbo].[books]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[review_tickets] ADD CONSTRAINT [review_tickets_book_version_id_fkey] FOREIGN KEY ([book_version_id]) REFERENCES [dbo].[book_versions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[review_tickets] ADD CONSTRAINT [review_tickets_reviewer_id_fkey] FOREIGN KEY ([reviewer_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[media_assets] ADD CONSTRAINT [media_assets_book_version_id_fkey] FOREIGN KEY ([book_version_id]) REFERENCES [dbo].[book_versions]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reading_progress] ADD CONSTRAINT [reading_progress_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[reading_progress] ADD CONSTRAINT [reading_progress_book_id_fkey] FOREIGN KEY ([book_id]) REFERENCES [dbo].[books]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_id_fkey] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- FilteredUniqueIndex
CREATE UNIQUE NONCLUSTERED INDEX [books_active_version_id_key] ON [dbo].[books]([active_version_id]) WHERE [active_version_id] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

