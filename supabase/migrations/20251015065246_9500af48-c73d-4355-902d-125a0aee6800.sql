-- Create table for error messages configuration
CREATE TABLE IF NOT EXISTS public.error_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  icon_type TEXT NOT NULL CHECK (icon_type IN ('emoji', 'image')),
  icon_value TEXT NOT NULL,
  is_animated BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.error_messages ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read error messages
CREATE POLICY "Anyone can view error messages" 
ON public.error_messages 
FOR SELECT 
USING (true);

-- Only admins can modify error messages
CREATE POLICY "Admins can manage error messages" 
ON public.error_messages 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default error messages
INSERT INTO public.error_messages (error_type, title, message, icon_type, icon_value, is_animated) VALUES
('insufficient_balance', 'Haraaga kuma filna', 'Macaamiil Haraagaa kuguma filna fadlan lacag ku shubo si aad xirmada u iibsatid', 'emoji', '💰', true),
('user_cancelled', 'Waad diidday dalabka', 'Waad diidday dalabka lacag bixinta. Haddii aad rabtid iibsi, fadlan riix "Isku Day Mar Kale".', 'emoji', '❌', true),
('timeout', 'Waqtigu wuu dhamaaday', 'Waqtigu wuu dhamaaday. Fadlan isku day mar kale si aad xirmada u iibsatid.', 'emoji', '⏱️', true),
('general', 'Khalad ayaa dhacay', 'Lacag bixinta way fashilantay. Fadlan isku day mar kale.', 'emoji', '⚠️', true)
ON CONFLICT (error_type) DO NOTHING;

-- Create storage bucket for error icons
INSERT INTO storage.buckets (id, name, public) 
VALUES ('error-icons', 'error-icons', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for error icons
CREATE POLICY "Error icons are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'error-icons');

CREATE POLICY "Admins can upload error icons" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'error-icons' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update error icons" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'error-icons' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete error icons" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'error-icons' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_error_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_error_messages_updated_at
BEFORE UPDATE ON public.error_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_error_messages_updated_at();