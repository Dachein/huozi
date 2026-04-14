-- Support HTML content type and enforce content size limits

-- Constrain content_type to known values
ALTER TABLE public.pages
  ADD CONSTRAINT pages_content_type_check
  CHECK (content_type IN ('markdown', 'html'));

ALTER TABLE public.page_versions
  ADD CONSTRAINT page_versions_content_type_check
  CHECK (content_type IN ('markdown', 'html'));

-- Content size limit: 2MB
ALTER TABLE public.pages
  ADD CONSTRAINT pages_content_size_check
  CHECK (octet_length(content) <= 2097152);

ALTER TABLE public.page_versions
  ADD CONSTRAINT page_versions_content_size_check
  CHECK (octet_length(content) <= 2097152);
