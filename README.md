# Monthly student enrollment

A React form hosted on Vercel. It sends student details and a monthly physical card photo through a Vercel API to your existing Google Apps Script backend.

- **Google Sheets:** student name, index, batch, center, enrollment month, Pending status, and the image's Drive link.
- **Google Drive:** the original JPG/PNG/WebP card photo, up to 5 MiB (shown as 5 MB in the form). Uses your existing `UPLOAD_FOLDER_ID`.
- **Staff:** keep reviewing photos and updating statuses in your existing Sheet.
- **Students:** use the Vercel URL; no Google form, Google login or iframe is displayed by this frontend.

This package has been built and checked locally with mocked Sheet/Drive services. It has not been deployed and has not written records to your live Sheet. Complete the setup and live check below before sharing it with students.

## 1. Add the backend bridge to your EXISTING Apps Script project

Open the Apps Script editor attached to your enrollment Sheet:

https://script.google.com/u/0/home/projects/1YsQErdhoeRecuVJkAtNe8eLNrT78nmprV9xPRf2Y6HfZS3T_ABN203ql/edit

1. Keep your existing `Code.gs` and `Index.html`.
2. Beside **Files**, click **+ → Script**. Name it **Bridge**. Google adds `.gs` automatically.
3. Replace the new file's default `myFunction` code with the full contents of `apps-script/Bridge.gs` from this repo.
4. Save. There should be only one `doPost` function in the project. If you already have a custom `doPost`, combine its routing before adding this bridge.

The supplied `apps-script/Code.gs` and `apps-script/Index.html` are copies of the earlier backend for reference and recovery. **You only need to add Bridge.gs to the existing project.** The bridge calls `getOptions`, `validate_`, `image_`, and `submitEnrollment` from your existing Code.gs.

Do not create a new spreadsheet or rerun setup for this migration. In **Project Settings → Script properties**, check that the existing `SPREADSHEET_ID` and `UPLOAD_FOLDER_ID` still point to the same Sheet and folder. Leave their values unchanged.

## 2. Set the shared API secret

Generate a random secret locally. With Node.js installed, run:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value. You will use the **same exact value** in both services:

| Location | Name | Value |
| --- | --- | --- |
| Apps Script → Project Settings → Script properties | `VERCEL_API_SECRET` | Your generated secret |
| Vercel → Project → Settings → Environment Variables | `APPS_SCRIPT_SECRET` | The same generated secret |

In Apps Script, select **Add script property**, enter `VERCEL_API_SECRET`, paste your secret, and save. Never paste a real secret into a GitHub file, React source, or a variable whose name starts with `VITE_`. The `.env.example` in this repo contains a placeholder only.

## 3. Enable temporary-upload cleanup and update Apps Script deployment

1. In the Apps Script function selector, choose **installUploadCleanup**.
2. Click **Run**. Review and approve Google's requested permissions for your script. This creates a daily trigger to trash abandoned partial uploads older than 24 hours. It does not trash completed card photos.
3. Click **Deploy → Manage deployments**.
4. Select your existing web app deployment and click the **pencil/Edit** button.
5. For **Version**, select **New version**.
6. Keep **Execute as: Me** and **Who has access: Anyone** so the Vercel server can call it without a Google login.
7. Click **Deploy**, completing authorization if Google requests it. Keep the existing `/exec` URL:

```text
https://script.google.com/macros/s/YOUR_ID/exec
```

**Saving Apps Script alone is not enough.** The `/exec` endpoint uses the deployed version. Always select a new version after changing its code.

## 4. Make the GitHub repository

Extract the ZIP. Open a terminal inside the extracted `student-enrollment` folder, where `package.json` is located.

On GitHub, create an empty repository named `student-enrollment`. Do not add a generated README or license during creation, since this folder already contains its README.

Run these commands, replacing `YOUR_USERNAME` with your GitHub username:

```sh
git init
git branch -M main
git add .
git commit -m "Add React enrollment form and Apps Script bridge"
git remote add origin https://github.com/YOUR_USERNAME/student-enrollment.git
git push -u origin main
```

Sign in to GitHub if your Git client prompts you. `.gitignore` excludes dependencies, build output, local environment files, and Vercel settings. No real secret is included in the provided package.

Your repository root should contain:

```text
student-enrollment/
├── api/enrollment.js       # Vercel server API; credentials stay here on the server
├── apps-script/
│   ├── Bridge.gs           # Add this new file to Apps Script
│   ├── Code.gs             # Existing backend reference
│   ├── Index.html          # Existing Google form reference
│   └── check.cjs           # Existing backend checks
├── src/
│   ├── main.jsx            # React student form
│   ├── notes.js            # English + Sinhala notes shown above the card upload
│   ├── upload.js           # Photo validation and upload requests
│   ├── style.css           # Tailwind import and dark theme colors
│   ├── assets/logo.png     # Class logo
│   ├── lib/utils.js        # shadcn class-name helper
│   └── components/
│       ├── ui/             # shadcn components (alert, button, input, label, popover, select)
│       ├── Aurora.jsx, GradientText.jsx, ShinyText.jsx,
│       │   SpotlightCard.jsx, StarBorder.jsx   # React Bits effects
│       ├── CardNotes.jsx   # Renders the notes from notes.js
│       ├── MonthPicker.jsx # Month and year picker
│       └── PhotoDropzone.jsx # Card photo drag-and-drop box
├── check.mjs               # New transport checks
├── index.html
├── vite.config.js          # Tailwind plugin, "@" import alias, JSX setting
├── jsconfig.json, components.json   # shadcn setup
├── package.json
├── package-lock.json
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

## 5. Connect GitHub to Vercel

To keep your current `student-enrollment-livid.vercel.app` address:

1. Open your existing **student-enrollment** project in Vercel.
2. Open **Settings → Git**, select **Connect Git Repository**, and choose your new GitHub repo. Set **Production Branch** to `main`.
3. Under **Build and Deployment**, use:
   - **Framework Preset:** Vite
   - **Root Directory:** leave empty when these files are at the repo root
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm ci`
   - **Node.js:** 24.x (22.x also works)
4. Under **Environment Variables**, add both variables below for **Production** and **Preview** if you want preview deployments to work.

| Name | Value |
| --- | --- |
| `APPS_SCRIPT_URL` | The full `/exec` URL shown in step 3 |
| `APPS_SCRIPT_SECRET` | The same secret you saved as `VERCEL_API_SECRET` in Apps Script |

5. Save the settings. Push a commit to `main` to trigger the first Git-backed deployment. If your client has no file changes to commit, run:

```sh
git commit --allow-empty -m "Deploy from GitHub"
git push
```

6. Wait for the deployment to become **Ready**, then open your existing Vercel URL.

For a NEW Vercel project instead, use **Add New → Project → Import Git Repository**, choose Vite, add the same environment variables, and deploy. A new project gets its own address; it does not automatically replace your old project.

Environment variable changes apply to new deployments, so redeploy after changing them. Anyone using an unprotected preview deployment can submit to the same Sheet if it has these backend credentials; keep preview access limited to your testers.

## 6. Check the complete flow before sharing

1. Open the Vercel URL on a phone. Confirm that batch and center choices load.
2. Select a month and use a distinct test student index, for example `TEST-REACT-001`.
3. Upload a harmless test card image and submit once.
4. Open **Enrollments** in your Sheet. Confirm the new row has the correct details, **Pending** in column G, and a Drive link in column H.
5. Open that link as staff. Confirm the image is stored in your existing Drive folder.
6. Submit the same index and month again. It should reject a duplicate without adding another enrollment row.
7. As staff, update the original test row to **Completed** after your review. Confirm **Completed at** is filled and the staff views update.
8. Delete your test enrollment row and trash its test photo after checking. This is manual test cleanup, separate from the automatic partial-upload cleanup.

Staff with access to the Sheet also need permission to open your private Drive folder. Share that folder with the staff Google accounts who review cards. The code does not make uploaded photos public.

## Updating later

- **React layout, wording, styles, or Vercel API:** edit files in GitHub and commit to `main`. Vercel automatically builds and deploys.
- **Card upload notes (English and Sinhala):** edit `src/notes.js`. Each note is one `{ en, si }` item; add, remove or reorder them, then commit to `main`. Layout is in `src/components/CardNotes.jsx`.
- **New batches:** add each batch in column A of the Sheet's **Batches** tab below the header, for example `2029 A/L`.
- **New centers:** add each center in column A of **Centers** below the header.
- **Apps Script backend:** update the copy in GitHub, copy the changed code into the Apps Script editor, and deploy a **New version** there. GitHub/Vercel does not automatically publish Apps Script code.

Staff can continue using **Staff Dashboard**, **Staff Pending**, and **Staff Completed**. Edit statuses and notes in **Enrollments**, not the formula-based views. The React form records requests; it does not automatically activate an LMS account.

## Local checks and development

With Node.js 22.12+ or 24:

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run dev` runs the frontend only. For a functioning local API, copy `.env.example` to `.env.local`, set your real server secret there, and run Vercel's local development server:

```sh
npx vercel dev
```

Follow the CLI prompts to link to your Vercel project. Local API submissions use the live Sheet/Drive, so use deliberate test records. `npm test` itself uses mocks and does not touch live Google data.

## Troubleshooting

- **Enrollment is not configured yet:** set the two Vercel environment variables and redeploy.
- **Unauthorized request:** the two secrets do not match, or the latest Bridge.gs is not deployed.
- **The enrollment service did not respond:** check `/exec`, deploy a new Apps Script version, verify **Me / Anyone** settings, and check Apps Script **Executions** for failures. HTML from Google's login/error page is not a valid API response.
- **No batches or centers:** add values below row 1 in their Sheet tabs. Reload the form.
- **Upload expired:** submit again. Large uploads have a 15-minute temporary session that Google may evict sooner.
- **Request already exists:** ask staff to check the existing row before trying to create another request. A slow/disconnected response may still have saved the first submission.
- **Enrollment could not be saved:** staff should check Apps Script configuration, Drive permissions/storage, and quotas. If a final image was saved but a Sheet write failed, the final image is retained for staff recovery.

Photos larger than 2.5 MiB use two requests because Vercel caps request bodies at 4.5 MB and base64 increases size. The final photo is assembled and validated in Apps Script; its original contents are saved in Drive. The cache session holds only temporary metadata, not the photo.

Official references: [Vercel Node.js API functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel request limits](https://vercel.com/docs/functions/limitations), [Apps Script JSON content service and redirects](https://developers.google.com/apps-script/guides/content).
