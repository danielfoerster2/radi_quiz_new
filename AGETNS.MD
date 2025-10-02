This software is a graphical web interface for the latex auto-multiple-choice software with AI features. The language of the project is French.

The backend uses python/flask and auto-multiple-choice

The frontend uses typscript

Backend:

postgresql db with users (instructors), columns: email, user_uuid, salt, salted_password_hash, one_time_pwd, one_time_pwd_expires_at, verification_code

Directory structure:

{user_uuid}/
-user_defaults.sqlite db with columns first_name, last_name, institution_name, student_instructions, coding_explanation, email_subject, email_body
-classes.sqlite db with columns class_title and student_list
-quizes.sqlite db with columns quiz_uuid, quiz_title, creation_date, quiz_state, id_coding, number_of_questions, institution_name, student_instructions, coding_explanation, email_subject, email_body, class_title, date_of_quiz, duration
-several {list_uuid}.csv

-{user_uuid}/{quiz_uuid}
--questions.sqlite (columns: question_text, question_type, subject, answer_option1, answer_option2, answer_option3, answer_option4, answer_option5, answer_option6, answer_option7, answer_option8, answer_option9, answer_option10, correct_answer, points, question_number, illustration_filename, illustration_width)
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

D Help page: More detailed information on features of the software and how to use it. Possbility to send e-mails for support


E Quiz page:
    Contains tabs for:
    E1 Generalities: Parameters of the quiz, UI elements to enter the following information, load from (and save to once the button is pressed) to quizes.sqlite:
        E1a: quiz_title (required, cannot save if field is empty)
        E1b: institution_name
        E1c: Class title (editable class_title, but also drop down menu with all class_title entries from {user_uuid}/classes.sqlite to select from)
        E1d: date_of_quiz, calendar selector, french format
        E1e: duration
        E1f: student_instructions
        E1g: Student identification via coding for student ID (if yes id_coding saves number of digits and student explanation on coding their IDs coding_explanation, if no id_coding=-1)
       Save button
    E2 Questions: Add and edit questions of the quiz load from (and save to once the button is pressed) to questions.sqlite:
        Question attributes: question_text, question_type (simple, multiple-choice, or open), subject, answer_option1 (up to 10) (one in case of open question, at least two in case of simple or multiple-choice question), correct_answer1 (up to 10) (true of false), points, question_number (Q1, Q2, Q3 etc, always kept in the order in which the questions are displayed, changes on reordering), illustration_filename, illustration_width
        Possbility to reorder questions within a subject (questions are grouped by subejcts)
        Possbility to reorder subjects
        Possbility to add questions with AI based on subject and/or class material (upload txt or pdf file, max 5 MB), instructor can choose difficulty (easy, average, hard), number of questions to be generated, type of question to be generated (simple, multiple-choice, open)
    E3 Create subject: Compile and export pdf for students
        Ai verify subject button: check concurrently in 3 different prompts for spelling/grammar, correctness of questions and answers, and latex syntax
        Export AMC latex file
        Export pdf with answers
        Export pdf for n students (possibility to specify to randomize order of questions and answer options)
    E4 Evaluate: Grade student copies
        Upload pdf with student copies
        Select CSV student list corresponding to the class (see parameters page), or upload student list or leave blanc
        Button to analyze student copies
        After analysis: Display boxes detected as unchecked left column (75% page width) and checked (right column). Possibility to manually toggle box images as checked/unchecked. Possibility to view the check box image in the page context. Possbility to select a threshold grayscale value for box being detected as checked.
        If student list is available and student coded their IDs: Student name association: Display images of handwritten student names from copies together with the autmatically detected ID and the corresponding student name from the student list, possibility to associate the handwritten student name with another student on the list
        If not: Display images of handwritten student names and AI transcribed names (editable)
        Display student list with Last name, first name, student id, grade, e-mail address, and button to view corrected student copy
        Send corrected copies to students by email (if student e-mail is in the student list). Display default email subject and message body (see settings page) using placholders. This should be editable. Send to all and list of students to send e-mails individually (corrected answer sheet is viewable, preview of email, email address and grade)


Behaviour:
    - where is data coming from
    - which page is to be displayed when
    - locked state of the quiz


