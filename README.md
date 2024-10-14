<h1 align="center">
	PDF 2 Images
</h1>

This plugin allows you to easily convert PDF documents into images and insert them directly into your notes in Obsidian. It's ideal for taking notes from lecture slideshows, helping to capture important visual information from slides.

You can also choose to insert lines between the images for better organization and clarity, making your notes easier to read and structure. Perfect for students or anyone working with visual content in their notes.

<h2 align="center">
	How to use
</h2>

1. Activate the plugin from the Community Plugins page.
2. You can either
 	- Open command palette and type `Convert PDF to Images`.
	- Use the ribbon in the left ribbon menu (if activated in plugin settings).
4. Select your PDF file and click convert.
5. The images will be inserted into your note.

<h2 align="center">
	Settings
</h2>

### Image Quality
Adjust the image quality to suit your needs. The default setting is 1x, but you can reduce it to as low as 0.5x for smaller file sizes and improved performance, or increase it up to 2x for the highest image clarity.

### Image Insertion Method
Choose between two different methods for inserting images:
- Procedural: Images are generated and inserted one at a time.
- Batch: All images are generated first, then inserted simultaneously for a more streamlined process.

### Insert headers (BETA)
Toggle the option on to generate headers for each image based on pdf page analysis.
This feature is in beta and might not work as expected with some pdf files. I am working on settings to control the how aggresive the header exctraction is.

### Header size
Choose the size of the header to be inserted above each image. You can select the following options: `h1`, `h2`, `h3`,`h4`,`h5`.

### Header extraction sensitivity
Adjust the sensitivity of the header extraction algorithm. Increase this value if headers are not being detected correctly. Lower the value if non-headers are mistakenly being detected as headers. The default is set to 1.2.

### Optional Line Between Images
You can toggle the option to include or exclude an empty line beneath each image. 

### Enable ribbon icon
You have the option to add or remove a convenient icon in the toolbar for quick access to the conversion modal.

### Attachment Folder Path
Specify the folder where images generated from the PDF will be saved. You can either manually enter the path or use the folder selection button to choose the destination.

<h2 align="center">
	Support
</h2>

If you enjoy using the plugin, you can support my work and enthusiasm by buying me a coffee.<br>
<a href='https://ko-fi.com/Q5Q814LKGT' target='_blank'><img height='50' style='border:0px;height:50px;' src='https://storage.ko-fi.com/cdn/kofi3.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
