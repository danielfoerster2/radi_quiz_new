This software is a graphical web interface for the latex auto-multiple-choice software with AI features. The main language of the project is French.

The backend uses python/flask and auto-multiple-choice

postgresql db with users (instructors), columns: email, user_uuid, salt, salted_password_hash, one_time_pwd, one_time_pwd_expires_at, verification_code

The frontend uses typscript


Directory structure:

{user_uuid}/
-user_defaults.sqlite db with columns first_name, last_name, institution_name, student_instructions, coding_explanation, email_subject, email_body
-classes.sqlite db with columns class_title and student_list
-quizes.sqlite db with columns quiz_uuid, quiz_title, creation_date, quiz_state, id_coding, number_of_questions, institution_name, student_instructions, coding_explanation, email_subject, email_body, class_title, date_of_quiz, duration, random_question_order, random_answer_order
-several {list_uuid}.csv

-{user_uuid}/{quiz_uuid}
--questions.sqlite (columns: question_text, question_type, subject_title, subject_uuid, answer_option1, answer_option2, answer_option3, answer_option4, answer_option5, answer_option6, answer_option7, answer_option8, answer_option9, answer_option10, correct_answer, points, question_number, illustration_filename, illustration_width)
--list.csv
--illustrations (md5 hash of the file + ".png" or ".jpg"/".jpeg")
--{user_uuid}/{quiz_uuid}/amc_session


Frontend:

List of pages:

A Landing page:
    A1 Short description of the software
    A2 Buttons to create account and login (login with google should be possible (request only email) otherwise e-mail should be verified)
       Create account button behaviour (if not login with google): Ask user for email and password (to be entered twice, 8-30 characters, at least one upper case, lower case, number, and special character). Then entry in users postgresql is created with email, user_uuid (newly randomly generated), salt (newly randomly generated), salted_password_hash (calculated from hash and user supplied password, verification_code, if email is not already in the database or if email exists in db and verification_code is not "-1", otherwise an account already exists error is displayed. Verification code is sent to email address. Once email is verified, verification_code is set to "-1" in users db, a directory (user_uuid) is created with user_defaults.sqlite (prefilled with hardcoded student_instructions, coding_explanation, email_subject, email_body), classes.sqlite, quizes.sqlite (both empty) and user is logged in (only after verification code is entered)
       Create button behaviour (if login with google): if email exists in users postgresql db proceed to login, if not, entry in users postgresql is created with email, user_uuid (newly randomly generated), verification_code ("-1") and a directory (user_uuid) is created with user_defaults.sqlite (prefilled with hardcoded student_instructions, coding_explanation, email_subject, email_body), classes.sqlite, quizes.sqlite (both empty)
       Login button behaviour: compute salted pwd hash, compare pwd hash and login (if not login with google, otherwise just login with google). If hash compare fails, compare entered pwd with one_time_pwd and current time with one_time_pwd_expires_at of users postgresql. If both are ok, ask user for new password (to be entered twice, 8-30 characters, at least one upper case, lower case, number, and special character), generate new random salt, compute salted hash and save both to the users postgresql db, Also set one_time_pwd_expires_at to current time. If either is not ok, display login error message.
       Forgot password button: generate otp, send it to user e-mail and write it to users postgresql db (col one_time_pwd), and set expiry in 15 mins (col one_time_pwd_expires_at).

B Dashboard page
    B1 Button to create new quizes: Behaviour: new {quiz_uuid} is generated, {user_uuid}/{quiz_uuid} directory is created, row in quizes.sqlite is created with quiz_uuid, creation_date (current time), quiz_state ("unlocked"), id_coding ("8"), number_of_questions ("0"), institution_name, student_instructions, coding_explanation, email_subject, email_body (the last 5 all copied from user_defaults.sqlite). UI jumps to page E1
    B2 list of available quizes columns with quiz_title, number_of_questions, creation_date, quiz_state and actions (duplicate and delete) (loaded from quizes.sqlite).
    Delete behaviour: removes corresponding line in quizes.sqlite and deletes {user_uuid}/{quiz_uuid} directory.
    Duplicate behaviour: generates new {quiz_uuid} copies current {quiz_uuid} directory to new {quiz_uuid} directory omitting a possible amc_session subdirectory, and duplicates the row with current {quiz_uuid} in quizes.sqlite replacing {quiz_uuid} with the new {quiz_uuid}, quiz_state with "unlocked", creation_date with current time

C Settings page
    C1 Global defaults: Editable fields for: Name of education institution, Student instructions, E-mail subject for sending grades to students, e-mail text for student e-mails (with placeholders for student name, quiz title, grade, instructor name). When page loads the information is retrieved from user_defaults.sqlite and edits are saved there.
    C2 Student lists:
    Display current class for each row in classes.sqlite display editable class_title and student list ({list_uuid}.csv). Potential edits are to be written to classes.sqlite and {list_uuid}.csv. Default view is collapsed table.
    Create new class: Upload (csv) (verify if malformed, max 500kB) and display editable student lists with associated class_title containing columns id,nom,prenom,email (email being optional). For each list generate uuid and save list as {list_uuid}.csv and add an entry in classes.sqlite with class_title and {list_uuid}.csv.
    C3 Instructor details: editable fields for first_name, last_name to be loaded from and written to user_defaults.sqlite
    change e-mail address: let user enter new email address, send newly generated verification code (not savec to users postgresql db) to that address. Once the user enters the verification code save the new email to email in users postgresql db.
    change password: new password (to be entered twice, 8-30 characters, at least one upper case, lower case, number, and special character), generate new random salt, compute salted hash and save both to the users postgresql db
    download all my data: creates zip archive of {user_uuid} directory and lets user download it
    delete account: confirm first, logs out user, deletes {user_uuid} directory and removes corresponding line from users postgresql db

D Help page: More detailed information on features of the software and how to use it. Possibility to send e-mails for support. Use email_service for that.


E Quiz page:
    Contains tabs for:
    E1 Generalities: Parameters of the quiz, UI elements to enter the following information, load from (and save to) to quizes.sqlite:
        E1a: quiz_title (required, cannot save if field is empty)
        E1b: institution_name
        E1c: Class title (editable class_title, but also drop down menu with all class_title entries from {user_uuid}/classes.sqlite to select from)
        E1d: date_of_quiz, calendar selector, french format
        E1e: duration
        E1f: student_instructions
        E1g: Student identification via coding for student ID (if yes id_coding saves number of digits and student explanation on coding their IDs coding_explanation, if no id_coding=-1)
    E2 Questions (to be displayed as soon as generaties are saved, i.e. quiz_title is in the corresponding row of quizes.sqlite): Add and edit questions of the quiz load from (and save to) questions.sqlite:
        Question attributes: question_text (not editable if quiz_state is "locked"), question_type ("simple", "multiple-choice", or "open"; not editable if quiz_state is "locked"), subject_title (not editable if quiz_state is "locked"), subject_uuid (generated in case of a new subject title), answer_option1 (up to 10) (one in case of open question, at least two in case of simple or multiple-choice question, not editable if quiz_state is "locked"), correct_answer1 (up to 10) (true or false, always editable), points (always editable), question_number (Q1, Q2, Q3 etc, always kept in the order in which the questions are displayed, changes on reordering, automatic - never editable), illustration_filename, illustration_width  (not editable if quiz_state is "locked")
        Possbility to upload an illustration to accompagy a question of type .png or .jpg"/".jpeg, max. 5MB, to be saved as {user_uuid}/{quiz_uuid}/{image_md5_sum}.{png/jpg}. Can't be changed if quiz_state is "locked". A thumbnail of the illustration is shown after upload.
        Possbility to reorder questions within a subject (questions are grouped by subejcts). Can't be changed if quiz_state is "locked".
        Possbility to reorder subjects. Can't be changed if quiz_state is "locked".
        Possbility to add questions with AI based on subject and/or class material (upload txt or pdf file, max 5 MB), instructor can choose difficulty (easy, average, hard), number of questions to be generated, type of question to be generated (simple, multiple-choice, open). Use ai_service for that. Can't be done if quiz_state is "locked".
        New questions cannot be added or removed if quiz_state is "locked".
    E3 Create subject: Compile and export pdf for students (tab displayed if at least one question is in {user_uuid}/{quiz_uuid}/questions.sqlite)
        Behviour: if the tab is clicked: {user_uuid}/{quiz_uuid}/amc_session is created if it doesn't exist yes and Preremplies.tex is written to it. amc_latex_service creates the tex file on the basis of the corresponding row of quizes.sqlite and questions.sqlite
        AI verify subject button: check Preremplies.tex concurrently in 3 different prompts for spelling/grammar, correctness of questions and answers, and latex syntax. Use ai_service for that.
        Export AMC latex file button: lets user download Preremplies.tex as sujet.tex
        Export pdf with answers button: amc_compile_service compiles Preremplies.tex using auto-multiple-choice and lets user download reponses.pdf
        Export pdf for n students button: possibility to specify the number of students and to randomize (or not) order of questions and answer options (read from/written to random_question_order, random_answer_order of quizes.sqlite), placeholder student list {user_uuid}/{quiz_uuid}/list.csv is created and amc_compile_service compiles the document (using Preremplies.tex, the placeholder student list, and the corresponding row of quizes.sqlite), and lets user download sujet.pdf, sets quiz_state in quizes.sqlite to "locked"
    E4 Evaluate: Grade student copies (tab is displayed if the quiz is in locked state, see quizes.sqlite)
        Upload pdf with student copies (Max. 500MB) to be put in {user_uuid}/{quiz_uuid}/amc_session/copies.pdf
        Select CSV student list corresponding to the class (see parameters page), or upload student list (verify if malformed, max 500kB) or leave blanc: replaces the placeholder student list at {user_uuid}/{quiz_uuid}/list.csv
        Button to analyze student copies analyzes pdf with amc_analyze_service, on the basis of the uploaded pdf, and {user_uuid}/{quiz_uuid}/list.csv
        After analysis: Display boxes detected as unchecked left column (75% page width) and checked (right column). Possibility to manually toggle box images as checked/unchecked. Possibility to view the check box image in the page context. Possbility to select a threshold grayscale value for box being detected as checked.
        If student list is not left blanc and student coded their IDs (id_coding!=-1): Student name association: Display images of handwritten student names from copies together with the autmatically detected ID and the corresponding student name (first and last) from the student list, possibility to associate the handwritten student name with another student on the list
        If not: Display images of handwritten student names and AI transcribed names (editable). For this call ai_service for each individual image to get back the transcribed name.
        Display student list with last name, first name, student id (if column exists), grade, e-mail address (if column exists), and button to view corrected student copy. This list is to be constructed from notes.csv and list.csv.
        Send corrected copies to students by email (if student e-mail is in the student list). Display default email subject and message body (see settings page) using placholders. This should be editable, globally, not per student. Send to all and list of students to send e-mails individually (corrected answer sheet is viewable, preview of email, email address (should be editable individually) and grade). Use email_service for that (bcc and reply_to should be email col of users postgresql db).


Services:

amc_latex_service: creates amc latex document: input quizes.sqlite and questions.sqlite, output: amc_latex_document
amc_compile_service: sandbox (danger of latex injection), timeout:
    get_answer_sheet: input: amc_latex_document, output reponses.pdf
    get_subject: input: amc_latex_document, output sujet.pdf
amc_analyze_service input: amc_data; output more amc_data
ai_service: calls open ai api, gpt5
    generate_questions_simple: input: subject, course_material, number of questions, difficulty_level; output questions with 4 answer options (one is correct other are plausible but clearly wrong)
    generate_questions_multiple_choice: input: subject, course_material, number of questions, difficulty_level; output questions with 4 answer options (zero or more are correct other are plausible but clearly wrong)
    generate_questions_multiple_open: input: subject, course_material, number of questions, difficulty_level; output questions and answers with grading scale (how many percents should be attributed for a particular part of the answer)
    check_spelling_grammar: input: latex document; output: list of issues
    check_latex_syntax: input: latex document; output: list of issues
    check_factuality: input: latex document; output: list of issues
    image: input: image; output: first_name, last_name
    transcribe image: input: image; output: first_name, last_name


email_service: allows to send emails (input: to, reply_to, bcc, subject, body, attachment, output: success)


API enpoints:




Issues: double sided printing, two page on one printing, pages per copy
